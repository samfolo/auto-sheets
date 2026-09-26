/** `factory case verify`: judges a clone against every recorded case, or the ones given. */
import { judgeClone, type Verdict, type VerifyOptions } from '../cases/judge.ts';
import { PROJECT } from '../core/project.ts';
import { fail, type Result } from '../core/result.ts';
import type { Trace } from '../core/telemetry.ts';

/** The `case verify` command: fails, with every difference, if any case differs from Excel. */
export const verifyClone = async (
  options: VerifyOptions,
  trace: Trace,
): Promise<Result<Verdict[]>> => {
  const verdicts = await judgeClone(options, trace);
  if (!verdicts.success) return verdicts;
  const failed = verdicts.data.filter((verdict) => !verdict.passed);
  if (failed.length === 0) return verdicts;
  return fail(
    'CASES_FAILED',
    `${failed.length} of ${verdicts.data.length} cases differ from Excel.`,
    {
      details: failed.flatMap(({ id, problems }) => [
        `✖ ${id}`,
        ...problems.map((problem) => `    ${problem}`),
      ]),
      hint: `Run one case with \`${PROJECT.cli} case verify <id> --url ${options.url} --headed\` to watch it.`,
    },
  );
};

export const renderVerdicts = (verdicts: readonly Verdict[]): string =>
  [...verdicts.map(({ id }) => `✔ ${id}`), `All ${verdicts.length} cases match Excel.`].join('\n');
