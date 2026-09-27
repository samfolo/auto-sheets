/**
 * Checkpoints: commits in a build's workspace where the agent's app reached a new best score.
 * `check_cases` saves one whenever a check of every case beats the run's best so far; the build
 * restores the best one if the agent's final state scores lower. The score is kept in the commit
 * message, so the workspace's history is the only record.
 */
import { git } from '../kernel/index.ts';

const MESSAGE = (passed: number, total: number): string =>
  `chore: checkpoint at ${passed} of ${total} cases`;
const PATTERN = /^chore: checkpoint at (\d+) of (\d+) cases$/;

/** A commit where the agent's app reached a score. */
export interface Checkpoint {
  readonly commit: string;
  readonly passed: number;
}

/** Commits the workspace as it stands, recording the score it reached. */
export const saveCheckpoint = (workspace: string, passed: number, total: number): void => {
  git(workspace, 'add', '--all');
  git(workspace, 'commit', '--quiet', '--message', MESSAGE(passed, total));
};

/** The checkpoint with the highest score, the latest among equals; null if there is none. */
export const bestCheckpoint = (workspace: string): Checkpoint | null => {
  const log = git(workspace, 'log', '--format=%H %s') ?? '';
  const checkpoints = log.split('\n').flatMap((line) => {
    const [commit = '', ...subject] = line.split(' ');
    const match = PATTERN.exec(subject.join(' '));
    return match === null ? [] : [{ commit, passed: Number(match[1]) }];
  });
  // The log is newest first, so the first of the highest is the latest.
  return checkpoints.reduce<Checkpoint | null>(
    (best, next) => (best === null || next.passed > best.passed ? next : best),
    null,
  );
};

/**
 * Puts the workspace back as it was at a checkpoint, as a new commit, so the agent's later work
 * stays in the history. Returns whether it worked.
 */
export const restoreCheckpoint = (workspace: string, { commit, passed }: Checkpoint): boolean =>
  git(workspace, 'read-tree', '-u', '--reset', commit) !== null &&
  git(
    workspace,
    'commit',
    '--quiet',
    '--message',
    `chore: restore the checkpoint at ${passed} cases, since the final state scored lower`,
  ) !== null;
