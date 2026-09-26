/**
 * The value runtime shared by the evaluator and the functions: ranges, coercion and
 * the conversions Excel applies when an operator meets the wrong kind of value.
 */
import type { Rect } from '../address.js';
import { formatBoolean, formatNumber, isError, type CellError, type Scalar } from '../values.js';

/** A value read from a cell; null means the cell is empty. */
export type CellValue = Scalar | null;

/** A reference to a rectangle of cells, as produced by A1:B3. */
export interface RangeValue {
  rect: Rect;
}

/** Anything an expression can evaluate to. */
export type EvalValue = Scalar | null | RangeValue;

/** True when an evaluated value is a rectangle of cells. */
export const isRange = (value: EvalValue): value is RangeValue =>
  typeof value === 'object' && value !== null && 'rect' in value;

/** The cells a range covers, as readable values. */
export const rangeValues = (
  range: RangeValue,
  get: (col: number, row: number) => CellValue,
): CellValue[] => {
  const out: CellValue[] = [];
  for (let row = range.rect.r1; row <= range.rect.r2; row += 1) {
    for (let col = range.rect.c1; col <= range.rect.c2; col += 1) out.push(get(col, row));
  }
  return out;
};

/** The text Excel would show for a value on its way through `&`. */
export const displayText = (value: CellValue): string => {
  if (value === null) return '';
  if (typeof value === 'number') return formatNumber(value, 'general');
  if (typeof value === 'boolean') return formatBoolean(value);
  return value;
};

const NUMERIC_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?%?$/;

/** Turn a value into a number, or an error when it cannot be one. */
export const toNumber = (value: CellValue): number | CellError => {
  if (value === null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (isError(value)) return value;
  const text = value.trim();
  if (NUMERIC_TEXT.test(text)) {
    const percent = text.endsWith('%');
    const numeric = Number(percent ? text.slice(0, -1) : text);
    if (Number.isFinite(numeric)) return percent ? numeric / 100 : numeric;
  }
  return '#VALUE!';
};

/** How Excel orders values for comparisons: numbers, then text, then logicals. */
const rank = (value: CellValue): number => {
  if (value === null) return 0;
  if (typeof value === 'number') return 0;
  if (typeof value === 'string') return isError(value) ? 3 : 1;
  return 2;
};

/** Compare two values with Excel's rules; errors short-circuit before this is reached. */
export const compare = (left: CellValue, right: CellValue): number => {
  const leftRank = rank(left);
  const rightRank = rank(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right);
  }
  const a = displayText(left).toUpperCase();
  const b = displayText(right).toUpperCase();
  if (a < b) return -1;
  return a > b ? 1 : 0;
};

/** Excel's truthiness for IF and friends. */
export const toBoolean = (value: CellValue): boolean | CellError => {
  if (value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (isError(value)) return value;
  if (value === '') return false;
  if (value.toUpperCase() === 'TRUE') return true;
  if (value.toUpperCase() === 'FALSE') return false;
  return '#VALUE!';
};
