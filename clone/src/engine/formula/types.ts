/**
 * The bridge the evaluator uses to read cells, so the formula code never depends on the
 * sheet's storage.
 */
import type { CellValue } from './runtime.js';

/** Reads the current value of a cell; null when it is empty. */
export interface Reader {
  get: (col: number, row: number) => CellValue;
}
