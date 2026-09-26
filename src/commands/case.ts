import { createExcelDriver } from '../../targets/excel/driver/driver.ts';
import { withBrowser } from '../browser/session.ts';
import { compareTrajectories, formatDifference } from '../cases/compare.ts';
import { listCaseIds, loadCase, writeReference, type LoadedCase } from '../cases/repository.ts';
import { runSteps } from '../cases/run.ts';
import { displayPath } from '../contracts/files.ts';
import type { Reference } from '../contracts/reference.ts';
import { fail, ok, type Result } from '../core/result.ts';

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

/** What `case record` wrote. */
export interface Recording {
  readonly id: string;
  readonly file: string;
  readonly checkpoints: number;
}

/**
 * Runs a case on Excel twice, each time on a new blank workbook. If both runs agree, the
 * trajectory becomes the case's reference; if not, nothing is written, because a result
 * that changes between identical runs can't be ground truth.
 */
export const recordCase = async (id: string): Promise<Result<Recording>> => {
  const loaded = await loadCase(id);
  if (!loaded.success) return loaded;
  const { definition, definitionFile } = loaded.data;
  return withBrowser(async ({ context }) => {
    const driver = createExcelDriver(context);
    const first = await runSteps(driver, definition.steps);
    if (!first.success) return first;
    const second = await runSteps(driver, definition.steps);
    if (!second.success) return second;

    const differences = compareTrajectories(first.data, second.data);
    if (differences.length > 0) {
      return fail('REFERENCE_UNSTABLE', `Two recordings of ${id} disagreed, so neither was kept.`, {
        location: displayPath(definitionFile),
        details: differences.map(formatDifference),
        hint: 'Record it again. If it keeps disagreeing, the case depends on timing.',
      });
    }
    const reference: Reference = {
      recordedAt: new Date().toISOString(),
      environment: driver.environment,
      checkpoints: first.data,
    };
    const written = await writeReference(loaded.data, reference);
    if (!written.success) return written;
    return ok({ id, file: displayPath(written.data), checkpoints: first.data.length });
  });
};

export const renderRecording = ({ id, file, checkpoints }: Recording): string =>
  `Recorded ${id}: two runs agreed on ${checkpoints} checkpoint${checkpoints === 1 ? '' : 's'}.\nWrote ${file}.`;
