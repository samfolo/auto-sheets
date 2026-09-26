/**
 * `factory case …`: listing cases, recording them against Excel, and verifying a clone against
 * the recordings.
 */
import type { CommandRegistry } from '../cli/index.ts';
import { PROJECT, fail, ok, type Result, type Trace } from '../kernel/index.ts';
import { judgeClone, type Verdict, type VerifyOptions } from './judge.ts';
import { recordCase, renderRecording } from './record.ts';
import { listCaseIds, loadCase, type LoadedCase } from './repository.ts';

/** One line of `case list`. */
export interface CaseSummary {
  readonly id: string;
  readonly description: string;
  readonly tags: readonly string[];
  /** Whether Excel has been recorded for it. */
  readonly recorded: boolean;
}

/** Loads every case, reporting every invalid one rather than stopping at the first. */
const loadAll = async (): Promise<Result<LoadedCase[]>> => {
  const loaded = await Promise.all((await listCaseIds()).map((id) => loadCase(id)));
  const failures = loaded.filter((result) => !result.success);
  if (failures.length > 0) {
    return fail('CONTRACT_VIOLATION', `${failures.length} of ${loaded.length} cases are invalid.`, {
      details: failures.flatMap((failure) =>
        failure.success ? [] : [failure.error.message, ...(failure.error.details ?? [])],
      ),
    });
  }
  return ok(loaded.flatMap((result) => (result.success ? [result.data] : [])));
};

export const listCases = async (): Promise<Result<CaseSummary[]>> => {
  const loaded = await loadAll();
  if (!loaded.success) return loaded;
  return ok(
    loaded.data.map(({ id, definition, recorded }) => ({
      id,
      description: definition.description,
      tags: definition.tags,
      recorded,
    })),
  );
};

export const renderCases = (cases: readonly CaseSummary[]): string =>
  cases.length === 0
    ? 'No cases yet.'
    : cases
        .map(({ id, description, tags, recorded }) =>
          [
            recorded ? '●' : '○',
            ` ${id}`,
            tags.length > 0 ? ` [${tags.join(', ')}]` : '',
            `\n    ${description}`,
          ].join(''),
        )
        .join('\n');

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

export const registerCaseCommands = ({ program, run }: CommandRegistry): void => {
  const cases = program
    .command('case')
    .description('cases: scenarios run on Excel and the clone, with what Excel did recorded');

  cases
    .command('list')
    .description('list every case, grouped by area; ● means Excel has been recorded')
    .action(() => run('case list', listCases, renderCases));

  cases
    .command('record')
    .description('run a case on Excel twice and, if the runs agree, save it as the reference')
    .argument('<id>', 'the case id, which is its folder under the cases directory')
    .action((id) => run('case record', (trace) => recordCase(id, trace), renderRecording));

  cases
    .command('verify')
    .description('run recorded cases on a clone and compare what it shows with what Excel showed')
    .argument('[ids...]', 'the cases to run; every recorded case if none are given')
    .requiredOption('--url <url>', 'where the clone is running, such as http://localhost:4321')
    .option('--headed', 'show the browser window while the cases run')
    .action((ids, { url, headed }) =>
      run(
        'case verify',
        (trace) => verifyClone({ url, ids, headed: headed === true }, trace),
        renderVerdicts,
      ),
    );
};
