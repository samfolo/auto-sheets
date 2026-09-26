/**
 * The worksheet functions the sheet supports, with Excel's rules for what each one counts
 * and skips when its arguments are references rather than typed values.
 */
import {
  isRange,
  rangeValues,
  toBoolean,
  toNumber,
  type CellValue,
  type EvalValue,
} from './runtime.js';
import type { Reader } from './types.js';
import { isError, type CellError, type Scalar } from '../values.js';

interface Numbers {
  values: number[];
  error?: CellError;
}

/** Collect the numbers a set of arguments contributes, following each function's rules. */
const collectNumbers = (args: EvalValue[], reader: Reader, strictText: boolean): Numbers => {
  const values: number[] = [];
  let error: CellError | undefined;
  const visit = (value: CellValue, typed: boolean): void => {
    if (error) return;
    if (value === null) return;
    if (isError(value)) {
      error = value;
      return;
    }
    if (typeof value === 'number') {
      values.push(value);
      return;
    }
    if (typeof value === 'boolean') {
      values.push(value ? 1 : 0);
      return;
    }
    const numeric = toNumber(value);
    if (typeof numeric === 'number') values.push(numeric);
    else if (typed && strictText) error = numeric;
    else if (typed && !strictText) return;
    else return;
  };
  for (const arg of args) {
    if (typeof arg === 'object' && arg !== null && 'rect' in arg) {
      for (const value of rangeValues(arg, reader.get)) visit(value, false);
    } else {
      visit(arg, true);
    }
  }
  return error ? { values, error } : { values };
};

const roundTo = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * factor)) / factor;
};

/** Sum a list of arguments the way Excel's SUM does. */
const sum = (args: EvalValue[], reader: Reader): Scalar => {
  const { values, error } = collectNumbers(args, reader, true);
  if (error) return error;
  return values.reduce((total, value) => total + value, 0);
};

/** The arithmetic mean, where empty cells are skipped and zeros are counted. */
const average = (args: EvalValue[], reader: Reader): Scalar => {
  const { values, error } = collectNumbers(args, reader, true);
  if (error) return error;
  if (values.length === 0) return '#DIV/0!';
  return values.reduce((total, value) => total + value, 0) / values.length;
};

/** The smallest number, or 0 when no argument holds a number. */
const min = (args: EvalValue[], reader: Reader): Scalar => {
  const { values, error } = collectNumbers(args, reader, true);
  if (error) return error;
  return values.length === 0 ? 0 : Math.min(...values);
};

/** The largest number, or 0 when no argument holds a number. */
const max = (args: EvalValue[], reader: Reader): Scalar => {
  const { values, error } = collectNumbers(args, reader, true);
  if (error) return error;
  return values.length === 0 ? 0 : Math.max(...values);
};

/** Visit every value an argument list contributes, remembering which were typed. */
const walk = (
  args: EvalValue[],
  reader: Reader,
  visit: (value: CellValue, typed: boolean) => void,
): void => {
  for (const arg of args) {
    if (isRange(arg)) {
      for (const value of rangeValues(arg, reader.get)) visit(value, false);
    } else {
      visit(arg, true);
    }
  }
};

/** Count the values a predicate keeps. */
const valueCount = (
  args: EvalValue[],
  reader: Reader,
  keep: (value: CellValue, typed: boolean) => boolean,
): Scalar => {
  let total = 0;
  walk(args, reader, (value, typed) => {
    if (keep(value, typed)) total += 1;
  });
  return total;
};

/** Count the numbers only; text and logicals in references are not counted. */
const count = (args: EvalValue[], reader: Reader): Scalar =>
  valueCount(args, reader, (value, typed) => {
    if (typeof value === 'number') return true;
    if (!typed || value === null || isError(value)) return false;
    if (typeof value === 'boolean') return true;
    return typeof toNumber(value) === 'number';
  });

/** Count everything that is not an empty cell. */
const countA = (args: EvalValue[], reader: Reader): Scalar =>
  valueCount(args, reader, (value) => value !== null && value !== '');

/** The absolute value. */
const abs = (args: EvalValue[], reader: Reader): Scalar => {
  const { values, error } = collectNumbers(args, reader, true);
  if (error) return error;
  const first = values[0];
  return first === undefined ? 0 : Math.abs(first);
};

/** Round to a number of decimal places, half away from zero. */
const round = (args: EvalValue[], reader: Reader): Scalar => {
  const { values, error } = collectNumbers(args, reader, true);
  if (error) return error;
  if (values.length < 2) return values[0] ?? 0;
  return roundTo(values[0]!, Math.trunc(values[1]!));
};

/** Collect the logical values an AND/OR/NOT argument list contributes. */
const collectLogicals = (
  args: EvalValue[],
  reader: Reader,
): { values: boolean[]; error?: CellError } => {
  const values: boolean[] = [];
  let error: CellError | undefined;
  const visit = (value: CellValue, typed: boolean): void => {
    if (error) return;
    if (value === null) return;
    if (isError(value)) {
      error = value;
      return;
    }
    if (typeof value === 'boolean') {
      values.push(value);
      return;
    }
    if (typed && typeof value === 'number') {
      values.push(value !== 0);
      return;
    }
    if (typed) {
      const logical = toBoolean(value);
      if (typeof logical === 'boolean') values.push(logical);
      else error = logical;
    }
  };
  for (const arg of args) {
    if (typeof arg === 'object' && arg !== null && 'rect' in arg) {
      for (const value of rangeValues(arg, reader.get)) visit(value, false);
    } else {
      visit(arg, true);
    }
  }
  return error ? { values, error } : { values };
};

/** AND over the arguments, #VALUE! when there are no logical values. */
const and = (args: EvalValue[], reader: Reader): Scalar => {
  const { values, error } = collectLogicals(args, reader);
  if (error) return error;
  if (values.length === 0) return '#VALUE!';
  return values.every(Boolean);
};

/** OR over the arguments, #VALUE! when there are no logical values. */
const or = (args: EvalValue[], reader: Reader): Scalar => {
  const { values, error } = collectLogicals(args, reader);
  if (error) return error;
  if (values.length === 0) return '#VALUE!';
  return values.some(Boolean);
};

/** Reverse a single logical value. */
const not = (args: EvalValue[], reader: Reader): Scalar => {
  const { values, error } = collectLogicals(args, reader);
  if (error) return error;
  const first = values[0];
  return first === undefined ? false : !first;
};

const TABLE: Record<string, (args: EvalValue[], reader: Reader) => Scalar> = {
  SUM: sum,
  AVERAGE: average,
  MIN: min,
  MAX: max,
  COUNT: count,
  COUNTA: countA,
  ABS: abs,
  ROUND: round,
  AND: and,
  OR: or,
  NOT: not,
};

/** Apply a named function, or #NAME? when the sheet does not know it. */
export const applyFunction = (name: string, args: EvalValue[], reader: Reader): Scalar => {
  const fn = TABLE[name];
  if (!fn) return '#NAME?';
  return fn(args, reader);
};
