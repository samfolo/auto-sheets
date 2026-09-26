/**
 * The sheet: the cells it holds, recalculation of formula values, and how each cell is
 * displayed and announced. This is the only place that knows the stored cell layout.
 */
import { columnLetter } from './address.js';
import { emptyCell, type Cell } from './entry.js';
import { evaluateExpr } from './formula/evaluate.js';
import { isRange, type CellValue } from './formula/runtime.js';
import type { Reader } from './formula/types.js';
import { formatBoolean, formatNumber, isError, type Scalar } from './values.js';

/** The key a cell is stored under. */
const keyOf = (col: number, row: number): string => `${col},${row}`;

/** A stored cell's own value; undefined when it is a formula that must be evaluated. */
const storedScalar = (cell: Cell): Scalar | null | undefined => {
  if (cell.kind === 'number') return cell.number ?? 0;
  if (cell.kind === 'boolean') return cell.bool ?? false;
  if (cell.kind === 'text') return cell.text ?? '';
  if (cell.kind === 'error') return cell.error ?? '#VALUE!';
  return undefined;
};

/** A value's display, empty for an empty cell. */
const formatScalar = (value: Scalar | null, format: Cell['format']): string => {
  if (value === null) return '';
  if (typeof value === 'number') return formatNumber(value, format);
  if (typeof value === 'boolean') return formatBoolean(value);
  return value;
};

/** What the sheet shows and announces for one cell. */
export interface CellView {
  raw: string;
  display: string;
  annotations: string[];
}

/** The in-memory grid of cells with lazy, cycle-safe recalculation. */
export class Sheet {
  private readonly cells = new Map<string, Cell>();

  /** The stored cell at an address, or a blank cell. */
  get(col: number, row: number): Cell {
    return this.cells.get(keyOf(col, row)) ?? emptyCell();
  }

  /** Store a cell, or remove it when it is blank. */
  set(col: number, row: number, cell: Cell): void {
    if (cell.kind === 'empty') this.cells.delete(keyOf(col, row));
    else this.cells.set(keyOf(col, row), cell);
    this.invalidate();
  }

  /** Remove a cell. */
  clear(col: number, row: number): void {
    this.cells.delete(keyOf(col, row));
    this.invalidate();
  }

  /** Every address that holds something, for the API's state. */
  entries(): { col: number; row: number; address: string; view: CellView }[] {
    const out: { col: number; row: number; address: string; view: CellView }[] = [];
    for (const [key, cell] of this.cells) {
      const [colText, rowText] = key.split(',');
      const col = Number(colText);
      const row = Number(rowText);
      out.push({
        col,
        row,
        address: `${columnLetter(col)}${row + 1}`,
        view: this.view(col, row, cell),
      });
    }
    return out;
  }

  /** Drop every cached formula result so the next read recalculates. */
  private invalidate(): void {
    for (const cell of this.cells.values()) delete cell.computed;
  }

  /** The computed value of a cell, evaluating formulas on demand. */
  valueOf(col: number, row: number, stack = new Set<string>()): CellValue {
    const key = keyOf(col, row);
    const cell = this.cells.get(key);
    if (!cell || cell.kind === 'empty') return null;
    const stored = storedScalar(cell);
    if (stored !== undefined) return stored;
    if (cell.computed !== undefined) return cell.computed;
    if (cell.parseError || !cell.ast) return null;
    if (stack.has(key)) return 0;
    stack.add(key);
    const reader: Reader = { get: (c, r) => this.valueOf(c, r, stack) };
    const result = evaluateExpr(cell.ast, reader);
    stack.delete(key);
    const scalar: Scalar | null = isRange(result) ? '#VALUE!' : result;
    cell.computed = scalar;
    return scalar;
  }

  /** How one cell is displayed and announced. */
  view(col: number, row: number, known?: Cell): CellView {
    const cell = known ?? this.get(col, row);
    return {
      raw: cell.raw,
      display: this.display(col, row, cell),
      annotations: this.annotations(col, row, cell),
    };
  }

  /** The text shown in the cell. */
  display(col: number, row: number, known?: Cell): string {
    const cell = known ?? this.get(col, row);
    if (cell.kind === 'empty') return '';
    if (cell.kind === 'formula') {
      if (cell.parseError) return cell.raw;
      return formatScalar(this.valueOf(col, row), 'general');
    }
    const stored = storedScalar(cell);
    return stored === undefined ? '' : formatScalar(stored, cell.format);
  }

  /** Anything else Excel announces about the cell. */
  annotations(col: number, row: number, known?: Cell): string[] {
    const cell = known ?? this.get(col, row);
    if (cell.kind === 'formula') {
      if (cell.parseError) return ['The formula in this cell contains an error.'];
      const value = this.valueOf(col, row);
      if (typeof value === 'string' && isError(value)) return ['Contains error'];
      return ['Contains Formula'];
    }
    if (cell.kind === 'error') return ['Contains error'];
    return [];
  }
}
