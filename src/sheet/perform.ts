/**
 * Doing one step on a sheet through a Driver. An observe step reads its cells one at a time,
 * since observing a cell selects it; an observe-selection step reads the selection without
 * changing it; every other step is one action.
 */
import { inOrder, ok, type Result } from '../kernel/index.ts';
import type { CellAddress, CellObservation, SelectionObservation, Step } from './contract.ts';
import type { Driver } from './driver.ts';

/** What an observe step saw: each cell, by address. */
export type Observed = Record<CellAddress, CellObservation>;

/** Observes each cell in turn and returns what each one showed, by address. */
export const observeCells = async (
  driver: Driver,
  cells: readonly CellAddress[],
): Promise<Result<Observed>> => {
  // Observing a cell selects it, so cells are read one at a time.
  const observations = await inOrder(cells, async (cell) => {
    const observation = await driver.observe(cell);
    return observation.success ? ok([cell, observation.data] as const) : observation;
  });
  return observations.success ? ok(Object.fromEntries(observations.data)) : observations;
};

/** What a checkpoint saw: cells, or the selection. */
export interface Observation {
  readonly cells: Observed;
  readonly selection?: SelectionObservation;
}

/** Does one step. A checkpoint returns what it saw; every other step returns null. */
export const performStep = async (
  driver: Driver,
  step: Step,
): Promise<Result<Observation | null>> => {
  if (step.do === 'observe') {
    const cells = await observeCells(driver, step.cells);
    return cells.success ? ok({ cells: cells.data }) : cells;
  }
  if (step.do === 'observe-selection') {
    const selection = await driver.observeSelection();
    return selection.success ? ok({ cells: {}, selection: selection.data }) : selection;
  }
  const done = await driver.perform(step);
  return done.success ? ok(null) : done;
};
