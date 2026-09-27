import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { git } from '../kernel/index.ts';
import { bestCheckpoint, restoreCheckpoint, saveCheckpoint } from './checkpoints.ts';

/** Out of how many cases the checkpoints here score. */
const TOTAL = 10;

/**
 * A repository whose commits each write a version of `app.txt`: a checkpoint for a number of cases
 * passed, or an ordinary commit for a message.
 */
const repository = (commits: readonly (number | string)[]): string => {
  const dir = mkdtempSync(join(tmpdir(), 'checkpoints-'));
  git(dir, 'init', '--quiet');
  for (const [index, commit] of commits.entries()) {
    writeFileSync(join(dir, 'app.txt'), `version ${index}`);
    if (typeof commit === 'number') {
      saveCheckpoint(dir, commit, TOTAL);
    } else {
      git(dir, 'add', '--all');
      git(dir, 'commit', '--quiet', '--message', commit);
    }
  }
  return dir;
};

describe('bestCheckpoint', () => {
  it.each([
    { commits: ['feat: start'], passed: null },
    { commits: [3, 7, 'fix: tidy'], passed: 7 },
    { commits: [9, 4], passed: 9 },
  ])('finds the highest checkpoint among $commits', ({ commits, passed }) => {
    expect(bestCheckpoint(repository(commits))?.passed ?? null).toBe(passed);
  });

  it('prefers the latest of equal checkpoints', () => {
    const dir = repository([6, 6]);
    expect(bestCheckpoint(dir)?.commit).toBe(git(dir, 'rev-parse', 'HEAD'));
  });
});

describe('restoreCheckpoint', () => {
  it('puts the files back as a new commit, keeping the later work in the history', () => {
    const dir = repository([TOTAL, 'refactor: a sweep that broke it']);
    const best = bestCheckpoint(dir);
    expect(best).not.toBeNull();
    expect(best !== null && restoreCheckpoint(dir, best)).toBe(true);
    expect(readFileSync(join(dir, 'app.txt'), 'utf8')).toBe('version 0');
    expect(git(dir, 'log', '--format=%s')?.split('\n')).toHaveLength(3);
  });
});
