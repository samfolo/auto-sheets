/**
 * `factory case …`: listing cases and recording them against Excel. Checking a clone against the
 * recordings is `factory clone check`.
 */
import type { CommandRegistry } from '../cli/index.ts';
import { fail, ok, type Result } from '../kernel/index.ts';
import type { Verdict } from './contract.ts';
import { exploreCases, renderExploration } from './explore.ts';
import { recordCase, renderRecording } from './record.ts';
import { loadAllCases } from './repository.ts';

/** One line of `case list`. */
export interface CaseSummary {
  readonly id: string;
  readonly description: string;
  readonly tags: readonly string[];
  /** Whether Excel has been recorded for it. */
  readonly recorded: boolean;
}

export const listCases = async (): Promise<Result<CaseSummary[]>> => {
  const loaded = await loadAllCases();
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

/** Verdicts as a command's outcome: a failure, with every difference, if any case differs. */
export const reportVerdicts = (verdicts: Verdict[], hint: string): Result<Verdict[]> => {
  const failed = verdicts.filter((verdict) => !verdict.passed);
  if (failed.length === 0) return ok(verdicts);
  return fail('CASES_FAILED', `${failed.length} of ${verdicts.length} cases differ from Excel.`, {
    details: failed.flatMap(({ id, problems }) => [
      `✖ ${id}`,
      ...problems.map((problem) => `    ${problem}`),
    ]),
    hint,
  });
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
    .command('explore')
    .description('generate random sequences of gestures and record what Excel does in each')
    .option(
      '--seed <seed>',
      'where the random sequences start; the same seed gives the same cases',
      String(Date.now() % 1_000_000),
    )
    .option('--count <count>', 'how many sequences to generate and record', '5')
    .option('--steps <steps>', 'how many gestures each sequence makes', '6')
    .option(
      '--focus <focus>',
      'mixed; areas for many separate areas with Command held; entry for values and formulas',
      'mixed',
    )
    .action((options) =>
      run('case explore', (trace) => exploreCases(options, trace), renderExploration),
    );
};
