/**
 * `check_cases`: the agent's only view of the verification suite. It runs the recorded cases on
 * a fresh copy of the agent's app and answers with the scoreboard. The agent gets the verdicts,
 * never the factory itself: it can't read the checker's code, change the references, or see the
 * held-out cases. When a check of every case beats the best score so far, the tool commits the
 * workspace, so its history marks each step forward and when it happened.
 */
import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from '@earendil-works/pi-ai';
import { join } from 'node:path';
import type { RecordedCase } from '../../cases/index.ts';
import { checkClone } from '../../clone/index.ts';
import type { Trace } from '../../kernel/index.ts';
import { saveCheckpoint } from '../checkpoints.ts';
import { createScoreboard, formatScoreReport } from '../scoreboard.ts';
import { toolText } from './text.ts';

export const CHECK_CASES = {
  name: 'check_cases',
  label: 'Check cases',
  description: [
    'Checks your app against the behaviour recorded on the original product.',
    'It starts a fresh copy of your app from this workspace with `npm start` (on its own port, so a copy you are running is unaffected),',
    'runs each recorded case through the screen exactly as it was recorded on the original, then stops it.',
    'It reports your score, what your last change fixed or broke, and every difference from the original.',
  ].join(' '),
  /** The app's output from every check, in the run's folder. */
  logFile: 'check-app.log',
} as const;

const parameters = Type.Object({
  cases: Type.Optional(
    Type.Array(Type.String(), {
      description:
        'Only these cases, by id: the folder under cases/, such as errors/division-by-zero-spreads-to-dependants. Leave out to check every case.',
    }),
  ),
});

/** What a check tells the agent, and whether the app is done. */
export interface CheckOutcome {
  readonly text: string;
  /** Every visible case passed in a check of all of them. */
  readonly complete: boolean;
}

/** The agent's checks of its app. `check_cases` and the harness share one, and one scoreboard. */
export interface CaseChecker {
  /** Checks these visible cases, or all of them when empty, and reports as the agent reads it. */
  readonly check: (cases: readonly string[]) => Promise<CheckOutcome>;
}

const incomplete = (text: string): CheckOutcome => ({ text, complete: false });

/**
 * A checker for one run, over the cases the run was given when it started. Cases recorded later,
 * and the held-out cases, are never checked, so a run is judged against one fixed set.
 */
export const createCaseChecker = (
  workspace: string,
  runDir: string,
  cases: readonly RecordedCase[],
  trace: Trace,
): CaseChecker => {
  const scoreboard = createScoreboard();
  const best = { passed: 0 };
  const known = new Set(cases.map(({ id }) => id));
  return {
    check: async (ids) => {
      const unknown = ids.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        return incomplete(
          `There are no cases ${unknown.join(', ')}. The cases are the folders under cases/.`,
        );
      }
      const verdicts = await checkClone(
        workspace,
        {
          cases: ids.length > 0 ? cases.filter(({ id }) => ids.includes(id)) : cases,
          logFile: join(runDir, CHECK_CASES.logFile),
        },
        trace,
      );
      if (!verdicts.success) {
        const { message, details = [] } = verdicts.error;
        trace('agent.check', { problem: message });
        return incomplete([message, ...details].join('\n'));
      }
      const report = scoreboard.record(verdicts.data);
      trace('agent.score', {
        passed: report.passed,
        total: report.total,
        before: report.before,
        fixed: report.fixed,
        broken: report.broken,
      });
      const everyCase = ids.length === 0;
      if (everyCase && report.passed > best.passed) {
        best.passed = report.passed;
        saveCheckpoint(workspace, report.passed, report.total);
      }
      return {
        text: formatScoreReport(report),
        complete: everyCase && report.total > 0 && report.passed === report.total,
      };
    },
  };
};

export const createCheckCasesTool = (checker: CaseChecker) =>
  defineTool({
    name: CHECK_CASES.name,
    label: CHECK_CASES.label,
    description: CHECK_CASES.description,
    parameters,
    // It may commit the workspace, so it never runs alongside the agent's other tools.
    executionMode: 'sequential',
    execute: async (_toolCallId, { cases = [] }) => toolText((await checker.check(cases)).text),
  });
