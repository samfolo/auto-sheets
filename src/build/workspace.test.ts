import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHECKPOINT } from '../agent/index.ts';
import { git } from '../kernel/index.ts';
import { bestCheckpoint, restoreCheckpoint } from './workspace.ts';

/** A repository whose commits write `app.txt` with each version, with the given messages. */
const repository = (commits: readonly { version: string; message: string }[]): string => {
  const dir = mkdtempSync(join(tmpdir(), 'checkpoints-'));
  git(dir, 'init', '--quiet');
  for (const { version, message } of commits) {
    writeFileSync(join(dir, 'app.txt'), version);
    git(dir, 'add', '--all');
    git(dir, 'commit', '--quiet', '--message', message);
  }
  return dir;
};

describe('bestCheckpoint', () => {
  it.each([
    { messages: ['feat: start'], passed: null },
    { messages: [CHECKPOINT.message(3, 10), CHECKPOINT.message(7, 10), 'fix: tidy'], passed: 7 },
    { messages: [CHECKPOINT.message(9, 10), CHECKPOINT.message(4, 10)], passed: 9 },
  ])('finds the highest checkpoint among $messages', ({ messages, passed }) => {
    const dir = repository(messages.map((message, index) => ({ version: `${index}`, message })));
    expect(bestCheckpoint(dir)?.passed ?? null).toBe(passed);
  });
});

describe('restoreCheckpoint', () => {
  it('puts the files back as a new commit, keeping the later work in the history', () => {
    const dir = repository([
      { version: 'working', message: CHECKPOINT.message(10, 10) },
      { version: 'broken', message: 'refactor: a sweep that broke it' },
    ]);
    const best = bestCheckpoint(dir);
    expect(best).not.toBeNull();
    expect(best !== null && restoreCheckpoint(dir, best)).toBe(true);
    expect(readFileSync(join(dir, 'app.txt'), 'utf8')).toBe('working');
    expect(git(dir, 'log', '--format=%s')?.split('\n')).toHaveLength(3);
  });
});
