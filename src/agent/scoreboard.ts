/**
 * The agent's reward signal. Each check is compared with the last result for the same cases, so
 * after every change the agent sees its score, what the change fixed and what it broke. The
 * factory traces each score, so a run's progress can be plotted afterwards.
 */
import type { Verdict } from '../cases/index.ts';
import type { Tally } from '../clone/index.ts';

export interface ScoreReport {
  readonly passed: number;
  readonly total: number;
  /** How the cases checked before did when each was last checked, or null if none were. */
  readonly before: Tally | null;
  /** Cases that failed when last checked and pass now. */
  readonly fixed: readonly string[];
  /** Cases that passed when last checked and fail now. */
  readonly broken: readonly string[];
  readonly failing: readonly Verdict[];
}

export interface Scoreboard {
  /** Compares a check with the last result for each of its cases, and remembers it. */
  readonly record: (verdicts: readonly Verdict[]) => ScoreReport;
}

const ids = (verdicts: readonly Verdict[]): string[] => verdicts.map(({ id }) => id);

export const createScoreboard = (): Scoreboard => {
  const last = new Map<string, boolean>();
  return {
    record: (verdicts) => {
      const seenBefore = verdicts.filter(({ id }) => last.has(id));
      const report: ScoreReport = {
        passed: verdicts.filter(({ passed }) => passed).length,
        total: verdicts.length,
        before:
          seenBefore.length === 0
            ? null
            : {
                passed: seenBefore.filter(({ id }) => last.get(id)).length,
                total: seenBefore.length,
              },
        fixed: ids(seenBefore.filter(({ id, passed }) => passed && last.get(id) === false)),
        broken: ids(seenBefore.filter(({ id, passed }) => !passed && last.get(id) === true)),
        failing: verdicts.filter(({ passed }) => !passed),
      };
      for (const { id, passed } of verdicts) last.set(id, passed);
      return report;
    },
  };
};

const formatBefore = (before: Tally | null, total: number): string => {
  if (before === null) return '.';
  if (before.total === total) return ` (${before.passed} before).`;
  return ` (${before.passed} of the ${before.total} checked before).`;
};

/** The report as the agent reads it: the score first, then what changed, then every difference. */
export const formatScoreReport = ({
  passed,
  total,
  before,
  fixed,
  broken,
  failing,
}: ScoreReport): string =>
  [
    `${passed} of ${total} cases match the original${formatBefore(before, total)}`,
    ...(fixed.length > 0 ? [`Fixed since the last check: ${fixed.join(', ')}.`] : []),
    ...(broken.length > 0
      ? [
          `Broken since the last check: ${broken.join(', ')}. Your last change undid behaviour that worked; look at it first.`,
        ]
      : []),
    ...failing.flatMap(({ id, problems }) => [
      '',
      `✖ ${id}`,
      ...problems.map((problem) => `    ${problem}`),
    ]),
  ].join('\n');
