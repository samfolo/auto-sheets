/**
 * Evaluate a parsed formula against a reader, applying Excel's operator precedence and
 * its conversions when an operator meets text, a logical or an empty cell.
 */
import { normalizeRect } from '../address.js';
import type { Expr } from './ast.js';
import { applyFunction } from './functions.js';
import { compare, displayText, isRange, toBoolean, toNumber, type EvalValue } from './runtime.js';
import type { Reader } from './types.js';
import { isError, type Scalar } from '../values.js';

/** The first error among a set of values, if any. */
const firstError = (...values: EvalValue[]): Scalar | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && isError(value)) return value;
  }
  return undefined;
};

/** One operand as a scalar, or #VALUE! when it is a range used where one value is needed. */
const scalarOf = (value: EvalValue): Scalar | null => {
  if (isRange(value)) return '#VALUE!';
  return value;
};

const arithmetic = (op: string, left: EvalValue, right: EvalValue): Scalar => {
  const error = firstError(left, right);
  if (error) return error;
  const a = toNumber(scalarOf(left));
  const b = toNumber(scalarOf(right));
  if (typeof a !== 'number') return a;
  if (typeof b !== 'number') return b;
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '/') return b === 0 ? '#DIV/0!' : a / b;
  return a ** b;
};

const comparison = (op: string, left: EvalValue, right: EvalValue): Scalar => {
  const error = firstError(left, right);
  if (error) return error;
  const a = scalarOf(left);
  const b = scalarOf(right);
  if (a === null || b === null) {
    const empty = a === null && b === null;
    if (op === '=') return empty;
    if (op === '<>') return !empty;
  }
  const order = compare(a, b);
  if (op === '=') return order === 0;
  if (op === '<>') return order !== 0;
  if (op === '<') return order < 0;
  if (op === '>') return order > 0;
  if (op === '<=') return order <= 0;
  return order >= 0;
};

const concatenate = (left: EvalValue, right: EvalValue): Scalar => {
  const error = firstError(left, right);
  if (error) return error;
  return displayText(scalarOf(left)) + displayText(scalarOf(right));
};

const referenceValue = (expr: Extract<Expr, { t: 'ref' | 'range' }>, reader: Reader): EvalValue => {
  if (expr.t === 'ref') return reader.get(expr.ref.col, expr.ref.row);
  const rect = normalizeRect({
    c1: expr.from.col,
    r1: expr.from.row,
    c2: expr.to.col,
    r2: expr.to.row,
  });
  return { rect };
};

const evalIf = (args: Expr[], reader: Reader): Scalar | null => {
  const test = args[0] ? evaluateExpr(args[0], reader) : null;
  const truth = toBoolean(isRange(test) ? '#VALUE!' : test);
  if (typeof truth !== 'boolean') return truth;
  const branch = truth ? args[1] : args[2];
  if (!branch) return truth && args[1] ? '#VALUE!' : false;
  const result = evaluateExpr(branch, reader);
  return scalarOf(result);
};

const evalUnary = (expr: Extract<Expr, { t: 'unary' }>, reader: Reader): Scalar | null => {
  const operand = evaluateExpr(expr.operand, reader);
  const error = firstError(operand);
  if (error) return error;
  const value = toNumber(scalarOf(operand));
  if (typeof value !== 'number') return value;
  return expr.op === '-' ? -value : value;
};

const evalPercent = (expr: Extract<Expr, { t: 'percent' }>, reader: Reader): Scalar | null => {
  const operand = evaluateExpr(expr.operand, reader);
  const error = firstError(operand);
  if (error) return error;
  const value = toNumber(scalarOf(operand));
  return typeof value === 'number' ? value / 100 : value;
};

const COMPARISON_OPS = new Set(['=', '<>', '<', '>', '<=', '>=']);

const evalBinary = (expr: Extract<Expr, { t: 'binary' }>, reader: Reader): Scalar | null => {
  const left = evaluateExpr(expr.left, reader);
  const right = evaluateExpr(expr.right, reader);
  if (expr.op === '&') return concatenate(left, right);
  if (COMPARISON_OPS.has(expr.op)) return comparison(expr.op, left, right);
  return arithmetic(expr.op, left, right);
};

const evalFunction = (expr: Extract<Expr, { t: 'func' }>, reader: Reader): Scalar | null => {
  if (expr.name === 'IF') return evalIf(expr.args, reader);
  const args = expr.args.map((arg) => evaluateExpr(arg, reader));
  return applyFunction(expr.name, args, reader);
};

/** Evaluate one expression to a scalar or a range. */
export const evaluateExpr = (expr: Expr, reader: Reader): EvalValue => {
  switch (expr.t) {
    case 'number':
    case 'string':
    case 'bool':
    case 'error':
      return expr.v;
    case 'ref':
    case 'range':
      return referenceValue(expr, reader);
    case 'unary':
      return evalUnary(expr, reader);
    case 'percent':
      return evalPercent(expr, reader);
    case 'binary':
      return evalBinary(expr, reader);
    case 'func':
      return evalFunction(expr, reader);
    default:
      return '#VALUE!';
  }
};
