/**
 * `check_cases`: the agent's only view of the verification suite. It runs the recorded cases on
 * a fresh copy of the agent's app and answers with the scoreboard. The agent gets the verdicts,
 * never the factory itself: it can't read the checker's code, change the references, or see the
 * held-out cases.
 */
import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from '@earendil-works/pi-ai';
import { join } from 'node:path';
import { CASE_TAGS, selectCases } from '../../cases/index.ts';
import { checkClone } from '../../clone/index.ts';
import type { Trace } from '../../kernel/index.ts';
import { createScoreboard, formatScoreReport } from '../scoreboard.ts';

export const CHECK_CASES = {
  name: 'check_cases',
  label: 'Check cases',
  description: [
    'Checks your app against the behaviour recorded on the original product.',
    'It starts a fresh copy of your app from this workspace with `npm start` (on its own port, so a copy you are running is unaffected),',
    'runs each recorded case through the screen exactly as it was recorded on the original, then stops it.',
    'It reports your score, what your last change fixed or broke, and every difference from the original.',
  ].join(' '),
  /** Everything a check keeps from the agent. */
  withoutTags: [CASE_TAGS.heldOut],
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

const text = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  details: undefined,
});

export const createCheckCasesTool = (workspace: string, runDir: string, trace: Trace) => {
  const scoreboard = createScoreboard();
  return defineTool({
    name: CHECK_CASES.name,
    label: CHECK_CASES.label,
    description: CHECK_CASES.description,
    parameters,
    execute: async (_toolCallId, { cases = [] }) => {
      const visible = await selectCases({ ids: [], withoutTags: CHECK_CASES.withoutTags });
      if (!visible.success) return text(visible.error.message);
      const known = new Set(visible.data.map(({ id }) => id));
      const unknown = cases.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        return text(
          `There are no cases ${unknown.join(', ')}. The cases are the folders under cases/.`,
        );
      }
      const verdicts = await checkClone(
        workspace,
        {
          ids: cases,
          withoutTags: CHECK_CASES.withoutTags,
          logFile: join(runDir, CHECK_CASES.logFile),
        },
        trace,
      );
      if (!verdicts.success) {
        const { message, details = [] } = verdicts.error;
        trace('agent.check', { problem: message });
        return text([message, ...details].join('\n'));
      }
      const report = scoreboard.record(verdicts.data);
      trace('agent.score', {
        passed: report.passed,
        total: report.total,
        before: report.before,
        fixed: report.fixed,
        broken: report.broken,
      });
      return text(formatScoreReport(report));
    },
  });
};
