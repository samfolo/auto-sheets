// Evaluates parsed formulas against the workbook's cells.

import { areaContains, type Area } from './address.ts';
import { generalDisplay, parseDateLiteral, parseNumberLiteral, type ExcelError } from './content.ts';
import type { Ast } from './formula-parse.ts';

export type Scalar =
  | { t: 'n'; v: number }
  | { t: 's'; v: string }
  | { t: 'b'; v: boolean }
  | { t: 'e'; v: ExcelError }
  | { t: 'empty' };

export type V = Scalar | { t: 'range'; area: Area };

/** Reads the scalar value of one cell, evaluating formulas recursively. */
export type CellReader = (col: number, row: number) => Scalar;

const err = (v: ExcelError): Scalar => ({ t: 'e', v });

const firstError = (values: V[]): Scalar | null => {
  for (const v of values) if (v.t === 'e') return v;
  return null;
};

/** Collapse a range to a single cell's value where a scalar is expected. */
const scalarOf = (v: V, read: CellReader): Scalar => {
  if (v.t !== 'range') return v;
  const { area } = v;
  if (area.c1 === area.c2 && area.r1 === area.r2) return read(area.c1, area.r1);
  return err('#VALUE!');
};

/** Convert a scalar to a number the way Excel's arithmetic does. */
const toNum = (v: Scalar): number | Scalar => {
  switch (v.t) {
    case 'n':
      return v.v;
    case 'b':
      return v.v ? 1 : 0;
    case 'empty':
      return 0;
    case 'e':
      return v;
    case 's': {
      const num = parseNumberLiteral(v.v);
      if (num) return num.value;
      const date = parseDateLiteral(v.v, new Date());
      if (date && date.kind === 'date') return date.serial;
      if (/^(true|false)$/i.test(v.v.trim())) return v.v.trim().toLowerCase() === 'true' ? 1 : 0;
      return err('#VALUE!');
    }
  }
};

/** Convert a scalar to text for the & operator. */
const toText = (v: Scalar): string | Scalar => {
  switch (v.t) {
    case 's':
      return v.v;
    case 'n':
      return generalDisplay(v.v);
    case 'b':
      return v.v ? 'TRUE' : 'FALSE';
    case 'empty':
      return '';
    case 'e':
      return v;
  }
};

const toBool = (v: Scalar): boolean | Scalar => {
  switch (v.t) {
    case 'b':
      return v.v;
    case 'n':
      return v.v !== 0;
    case 'empty':
      return false;
    case 'e':
      return v;
    case 's': {
      const t = v.v.trim().toLowerCase();
      if (t === 'true') return true;
      if (t === 'false') return false;
      return err('#VALUE!');
    }
  }
};

const RANK: Record<Scalar['t'], number> = { n: 0, empty: 0, s: 1, b: 2, e: 3 };

const compareValues = (a: Scalar, b: Scalar): number | Scalar => {
  const na = a.t === 'n' || a.t === 'empty' ? toNum(a) : null;
  const nb = b.t === 'n' || b.t === 'empty' ? toNum(b) : null;
  if (na !== null && nb !== null && typeof na === 'number' && typeof nb === 'number')
    return na - nb;
  if (a.t === 's' && b.t === 's') {
    const x = a.v.toLowerCase();
    const y = b.v.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return RANK[a.t] - RANK[b.t];
};

const arith = (op: string, a: number, b: number): Scalar => {
  switch (op) {
    case '+':
      return { t: 'n', v: a + b };
    case '-':
      return { t: 'n', v: a - b };
    case '*':
      return { t: 'n', v: a * b };
    case '/':
      return b === 0 ? err('#DIV/0!') : { t: 'n', v: a / b };
    case '^': {
      const v = a ** b;
      return Number.isNaN(v) ? err('#NUM!') : { t: 'n', v };
    }
    default:
      return err('#VALUE!');
  }
};

const binary = (op: string, left: V, right: V, read: CellReader): Scalar => {
  const failed = firstError([left, right]);
  if (failed) return failed;
  const a = scalarOf(left, read);
  const b = scalarOf(right, read);
  if (a.t === 'e') return a;
  if (b.t === 'e') return b;
  if (op === '&') {
    const ta = toText(a);
    const tb = toText(b);
    if (typeof ta !== 'string') return ta;
    if (typeof tb !== 'string') return tb;
    return { t: 's', v: ta + tb };
  }
  if ('=<>'.includes(op) && op.length <= 2) {
    const c = compareValues(a, b);
    if (typeof c !== 'number') return c;
    const result =
      op === '=' ? c === 0 : op === '<>' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
    return { t: 'b', v: result };
  }
  const na = toNum(a);
  const nb = toNum(b);
  if (typeof na !== 'number') return na;
  if (typeof nb !== 'number') return nb;
  return arith(op, na, nb);
};

/** Each cell of a range as a scalar. */
const rangeScalars = (area: Area, read: CellReader): Scalar[] => {
  const out: Scalar[] = [];
  const height = area.r2 - area.r1 + 1;
  const width = area.c2 - area.c1 + 1;
  if (height * width > 200000) return out;
  for (let r = area.r1; r <= area.r2; r += 1)
    for (let c = area.c1; c <= area.c2; c += 1) out.push(read(c, r));
  return out;
};

export { rangeScalars, scalarOf, toBool, toNum, toText, firstError, err };

/** Evaluate an AST. */
export const evalAst = (ast: Ast, read: CellReader): V => {
  switch (ast.kind) {
    case 'num':
      return { t: 'n', v: ast.value };
    case 'str':
      return { t: 's', v: ast.value };
    case 'bool':
      return { t: 'b', v: ast.value };
    case 'err':
      return { t: 'e', v: ast.value };
    case 'name':
      return err('#NAME?');
    case 'ref':
      return { t: 'range', area: ast.area };
    case 'un': {
      const v = scalarOf(evalAst(ast.expr, read), read);
      const n = toNum(v);
      if (typeof n !== 'number') return n;
      return { t: 'n', v: -n };
    }
    case 'pct': {
      const v = scalarOf(evalAst(ast.expr, read), read);
      const n = toNum(v);
      if (typeof n !== 'number') return n;
      return { t: 'n', v: n / 100 };
    }
    case 'bin':
      return binary(ast.op, evalAst(ast.left, read), evalAst(ast.right, read), read);
    case 'call':
      return callFunction(ast, read);
  }
};

const callFunction = (ast: { name: string; args: Ast[] }, read: CellReader): V => {
  if (ast.name === 'IF') return evalIf(ast.args, read);
  const args = ast.args.map((a) => evalAst(a, read));
  switch (ast.name) {
    case 'SUM':
      return aggregate(args, read, 'sum');
    case 'AVERAGE':
      return aggregate(args, read, 'avg');
    case 'MIN':
      return aggregate(args, read, 'min');
    case 'MAX':
      return aggregate(args, read, 'max');
    case 'COUNT':
      return aggregate(args, read, 'count');
    case 'COUNTA':
      return aggregate(args, read, 'counta');
    case 'AND':
      return logic(args, read, true);
    case 'OR':
      return logic(args, read, false);
    case 'NOT':
      return args.length === 1 ? notFn(scalarOf(args[0] as V, read)) : err('#VALUE!');
    case 'ABS': {
      const n = toNum(scalarOf(args[0] ?? { t: 'empty' }, read));
      return typeof n === 'number' ? { t: 'n', v: Math.abs(n) } : n;
    }
    case 'ROUND':
      return roundFn(args, read);
    default:
      return err('#NAME?');
  }
};

const notFn = (v: Scalar): Scalar => {
  const b = toBool(v);
  return typeof b === 'boolean' ? { t: 'b', v: !b } : b;
};

const evalIf = (args: Ast[], read: CellReader): V => {
  const test = scalarOf(evalAst(args[0] ?? { kind: 'bool', value: false }, read), read);
  const b = toBool(test);
  if (typeof b !== 'boolean') return b;
  if (b) return scalarOf(evalAst(args[1] ?? { kind: 'bool', value: true }, read), read);
  if (args.length < 3) return { t: 'b', v: false };
  return scalarOf(evalAst(args[2] as Ast, read), read);
};

// Aggregate functions: typed scalars convert, references take numbers only.
const aggregate = (args: V[], read: CellReader, mode: string): Scalar => {
  const nums: number[] = [];
  let counta = 0;
  const typed = (v: Scalar): Scalar | null => {
    if (v.t === 'e') return v;
    if (v.t === 'n') nums.push(v.v);
    else if (v.t === 'b') nums.push(v.v ? 1 : 0);
    else if (v.t === 's') {
      const n = parseNumberLiteral(v.v);
      if (n) nums.push(n.value);
      else if (mode !== 'count' && mode !== 'counta') return err('#VALUE!');
    }
    if (mode === 'counta' && v.t !== 'empty') counta += 1;
    return null;
  };
  const fromRef = (v: Scalar): Scalar | null => {
    if (v.t === 'e') return v;
    if (v.t === 'n') nums.push(v.v);
    if (mode === 'counta' && v.t !== 'empty') counta += 1;
    return null;
  };
  for (const arg of args) {
    const scalars = arg.t === 'range' ? rangeScalars(arg.area, read) : [arg];
    for (const s of scalars) {
      const failed = arg.t === 'range' ? fromRef(s) : typed(s);
      if (failed) return failed;
    }
  }
  return aggregateResult(nums, counta, mode);
};

const aggregateResult = (nums: number[], counta: number, mode: string): Scalar => {
  switch (mode) {
    case 'sum':
      return { t: 'n', v: nums.reduce((a, b) => a + b, 0) };
    case 'avg':
      return nums.length === 0
        ? err('#DIV/0!')
        : { t: 'n', v: nums.reduce((a, b) => a + b, 0) / nums.length };
    case 'min':
      return { t: 'n', v: nums.length === 0 ? 0 : Math.min(...nums) };
    case 'max':
      return { t: 'n', v: nums.length === 0 ? 0 : Math.max(...nums) };
    case 'count':
      return { t: 'n', v: nums.length };
    default:
      return { t: 'n', v: counta };
  }
};

const logic = (args: V[], read: CellReader, isAnd: boolean): Scalar => {
  const values: Scalar[] = [];
  for (const arg of args)
    if (arg.t === 'range') values.push(...rangeScalars(arg.area, read));
    else values.push(arg);
  const failed = firstError(values);
  if (failed) return failed;
  let seen = false;
  for (const v of values) {
    const b = toBool(v);
    if (typeof b !== 'boolean') continue;
    seen = true;
    if (isAnd && !b) return { t: 'b', v: false };
    if (!isAnd && b) return { t: 'b', v: true };
  }
  return seen ? { t: 'b', v: isAnd } : err('#VALUE!');
};

const roundFn = (args: V[], read: CellReader): Scalar => {
  const value = toNum(scalarOf(args[0] ?? { t: 'empty' }, read));
  const digits = toNum(scalarOf(args[1] ?? { t: 'empty' }, read));
  if (typeof value !== 'number') return value;
  if (typeof digits !== 'number') return digits;
  const factor = 10 ** Math.trunc(digits);
  const snapped = Number(value.toPrecision(15));
  return { t: 'n', v: (Math.round(Math.abs(snapped) * factor) / factor) * Math.sign(snapped) };
};

/** Whether a cell address is inside an area (used by spill detection later). */
export const inArea = areaContains;
