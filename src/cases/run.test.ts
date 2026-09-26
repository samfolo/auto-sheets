import { describe, expect, it } from 'vitest';
import type { Step } from '../contracts/case.ts';
import { ok } from '../core/result.ts';
import { createFakeDriver } from '../testing/fake-driver.ts';
import { runSteps } from './run.ts';

const cell = (raw: string) => ({ raw, display: raw, annotations: [] });

describe('runSteps', () => {
  it('records a checkpoint at each observe step, keyed by the step’s index', async () => {
    const steps: Step[] = [
      { do: 'enter', cell: 'A1', text: '2' },
      { do: 'observe', cells: ['A1', 'B1'] },
      { do: 'enter', cell: 'A1', text: '3' },
      { do: 'undo' },
      { do: 'observe', cells: ['A1'] },
      { do: 'redo' },
      { do: 'observe', cells: ['A1'] },
    ];
    expect(await runSteps(createFakeDriver(), steps)).toEqual(
      ok([
        { step: 1, cells: { A1: cell('2'), B1: cell('') } },
        { step: 4, cells: { A1: cell('2') } },
        { step: 6, cells: { A1: cell('3') } },
      ]),
    );
  });

  it('starts every run from a blank sheet', async () => {
    const driver = createFakeDriver();
    const steps: Step[] = [{ do: 'observe', cells: ['A1'] }];
    await runSteps(driver, [{ do: 'enter', cell: 'A1', text: 'left over' }, ...steps]);
    expect(await runSteps(driver, steps)).toEqual(ok([{ step: 0, cells: { A1: cell('') } }]));
  });

  it('says which step failed', async () => {
    const steps: Step[] = [
      { do: 'enter', cell: 'A1', text: '1' },
      { do: 'enter', cell: 'B2', text: '2' },
      { do: 'observe', cells: ['A1'] },
    ];
    expect(await runSteps(createFakeDriver({ failOn: ['B2'] }), steps)).toFailWith(
      'BROWSER_ACTION_FAILED',
      { message: 'Could not enter in B2.', details: ['at steps[1]'] },
    );
  });
});
