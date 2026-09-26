import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isInsideWorkspace } from './files.ts';

/** A workspace beside a folder it must not reach, with a link inside it that points there. */
const root = mkdtempSync(join(tmpdir(), 'confine-'));
const workspace = join(root, 'workspace');
mkdirSync(join(workspace, 'src'), { recursive: true });
mkdirSync(join(root, 'factory'));
writeFileSync(join(root, 'factory', '.env'), 'SECRET=1');
symlinkSync(join(root, 'factory'), join(workspace, 'escape'));

describe('isInsideWorkspace', () => {
  it.each([
    { path: 'src', inside: true },
    { path: 'src/new-file.ts', inside: true },
    { path: '.', inside: true },
    { path: join(workspace, 'src'), inside: true },
    { path: '../factory/.env', inside: false },
    { path: join(root, 'factory', '.env'), inside: false },
    { path: 'escape/.env', inside: false },
    { path: '/etc/hosts', inside: false },
  ])('treats $path as inside: $inside', ({ path, inside }) => {
    expect(isInsideWorkspace(workspace, path)).toBe(inside);
  });
});
