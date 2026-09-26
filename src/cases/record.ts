/**
 * Recording a case: running it on Excel twice, each time on a new workbook, and keeping the
 * trajectory as the case's reference only if both runs agree.
 */
import { excelTarget } from '../../targets/excel/index.ts';
import { withBrowser } from '../browser/index.ts';
import { displayPath, fail, ok, type Result, type Trace } from '../kernel/index.ts';
import { createSheetDriver } from '../sheet/index.ts';
import { compareTrajectories, formatDifference } from './compare.ts';
import type { Reference } from './contract.ts';
import { loadCase, writeReference } from './repository.ts';
import { runSteps } from './run.ts';

/** What `case record` wrote. */
export interface Recording {
  readonly id: string;
  readonly file: string;
  readonly checkpoints: number;
}

/**
 * Runs a case on Excel twice, each time on a new workbook: blank, or uploaded from seed.xlsx.
 * If both runs agree, the trajectory becomes the case's reference; if not, nothing is
 * written, because a result that changes between identical runs can't be ground truth.
 */
export const recordCase = async (id: string, trace: Trace): Promise<Result<Recording>> => {
  const loaded = await loadCase(id);
  if (!loaded.success) return loaded;
  const { definition, definitionFile, seedFile } = loaded.data;
  return withBrowser(async ({ context }) => {
    const driver = createSheetDriver(excelTarget(context), trace);
    const first = await runSteps(driver, definition.steps, seedFile);
    if (!first.success) return first;
    const second = await runSteps(driver, definition.steps, seedFile);
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
