/**
 * Doing one step on a sheet through a Driver. An observe step reads its cells one at a time,
 * since observing a cell selects it; every other step is one action.
 */
import { ok, type Result } from '../kernel/index.ts';
import type { CellAddress, CellObservation, Step } from './contract.ts';
import type { Driver } from './driver.ts';

/** What an observe step saw: each cell, by address. */
export type Observed = Record<CellAddress, CellObservation>;

/** Observes each cell in turn and returns what each one showed, by address. */
export const observeCells = async (
  driver: Driver,
  cells: readonly CellAddress[],
): Promise<Result<Observed>> => {
  const observed: Record<CellAddress, CellObservation> = {};
  for (const cell of cells) {
    // Observing a cell selects it, so cells are read one at a time.
    // oxlint-disable-next-line no-await-in-loop
    const observation = await driver.observe(cell);
    if (!observation.success) return observation;
    observed[cell] = observation.data;
  }
  return ok(observed);
};

/** Does one step. An observe step returns what it saw; every other step returns null. */
export const performStep = async (driver: Driver, step: Step): Promise<Result<Observed | null>> => {
  if (step.do === 'observe') return observeCells(driver, step.cells);
  const done = await driver.perform(step);
  return done.success ? ok(null) : done;
};
