// Tokenizer and parser for Excel formulas, producing an AST.

import { colToIndex, MAX_COL, MAX_ROW, type Area } from './address.ts';
import type { ExcelError } from './content.ts';

export type Ast =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'err'; value: ExcelError }
  | { kind: 'ref'; area: Area }
  | { kind: 'name'; name: string }
  | { kind: 'call'; name: string; args: Ast[] }
  | { kind: 'bin'; op: string; left: Ast; right: Ast }
  | { kind: 'un'; op: string; expr: Ast }
  | { kind: 'pct'; expr: Ast };

export class ParseError extends Error {}

interface Token {
  type: 'num' | 'str' | 'ident' | 'op' | 'err';
  text: string;
}

const ERRORS: ExcelError[] = ['#DIV/0!', '#VALUE!', '#NAME?', '#REF!', '#N/A', '#NUM!', '#NULL!'];

/** Split formula text (without the leading =) into tokens. */
export const tokenize = (src: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i += 1;
      continue;
    }
    if (ch === '"') {
      const end = scanString(src, i);
      tokens.push({ type: 'str', text: src.slice(i + 1, end - 1).replaceAll('""', '"') });
      i = end;
      continue;
    }
    if (ch === '#') {
      const err = ERRORS.find((e) => src.startsWith(e, i));
      if (!err) throw new ParseError(`bad error literal at ${i}`);
      tokens.push({ type: 'err', text: err });
      i += err.length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      tokens.push({ type: 'op', text: two });
      i += 2;
      continue;
    }
    if ('+-*/^%&()=,:<>'.includes(ch)) {
      tokens.push({ type: 'op', text: ch });
      i += 1;
      continue;
    }
    const ref = /^(\$?[A-Za-z]{1,3}\$?\d+)/.exec(src.slice(i));
    if (ref && ref[1] && colToIndex(ref[1].replaceAll('$', '')) <= MAX_COL) {
      tokens.push({ type: 'ident', text: ref[1] });
      i += ref[1].length;
      continue;
    }
    const word = /^\$?[A-Za-z]+/.exec(src.slice(i));
    if (word) {
      tokens.push({ type: 'ident', text: word[0] });
      i += word[0].length;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num && num[0]) {
      tokens.push({ type: 'num', text: num[0] });
      i += num[0].length;
      continue;
    }
    throw new ParseError(`unexpected ${ch}`);
  }
  return tokens;
};

const scanString = (src: string, start: number): number => {
  let i = start + 1;
  while (i < src.length) {
    if (src[i] === '"' && src[i + 1] === '"') {
      i += 2;
      continue;
    }
    if (src[i] === '"') return i + 1;
    i += 1;
  }
  throw new ParseError('unterminated string');
};

interface RefShape {
  col: number | null;
  row: number | null;
}

const parseRefShape = (text: string): RefShape | null => {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(text);
  if (m && m[1] && m[2]) {
    const col = colToIndex(m[1]);
    const row = Number(m[2]);
    if (col <= MAX_COL && row <= MAX_ROW) return { col, row };
    return null;
  }
  if (/^\$?[A-Za-z]{1,3}$/.test(text)) {
    const col = colToIndex(text.replace('$', ''));
    return col <= MAX_COL ? { col, row: null } : null;
  }
  return null;
};

const shapeArea = (a: RefShape, b: RefShape): Area | null => {
  if (a.col !== null && b.col !== null && a.row !== null && b.row !== null)
    return { c1: Math.min(a.col, b.col), r1: Math.min(a.row, b.row), c2: Math.max(a.col, b.col), r2: Math.max(a.row, b.row) };
  if (a.col !== null && b.col !== null && a.row === null && b.row === null)
    return { c1: Math.min(a.col, b.col), r1: 1, c2: Math.max(a.col, b.col), r2: MAX_ROW };
  if (a.col === null && b.col === null && a.row !== null && b.row !== null)
    return { c1: 1, r1: Math.min(a.row, b.row), c2: MAX_COL, r2: Math.max(a.row, b.row) };
  return null;
};

/** Parse tokens into an AST. Throws ParseError. */
export const parseTokens = (tokens: Token[]): Ast => {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const takeOp = (ops: string): string | null => {
    const t = peek();
    if (t && t.type === 'op' && ops.includes(t.text)) {
      pos += 1;
      return t.text;
    }
    return null;
  };
  const expect = (text: string): void => {
    if (!takeOp(text)) throw new ParseError(`expected ${text}`);
  };

  const primary = (): Ast => {
    const t = peek();
    if (!t) throw new ParseError('unexpected end');
    if (t.type === 'num') {
      pos += 1;
      const value = Number(t.text);
      const colon = tokens[pos];
      const tail = tokens[pos + 1];
      if (colon?.type === 'op' && colon.text === ':' && tail?.type === 'num') {
        pos += 2;
        return {
          kind: 'ref',
          area: { c1: 1, r1: Math.min(value, Number(tail.text)), c2: MAX_COL, r2: Math.max(value, Number(tail.text)) },
        };
      }
      return { kind: 'num', value };
    }
    if (t.type === 'str') {
      pos += 1;
      return { kind: 'str', value: t.text };
    }
    if (t.type === 'err') {
      pos += 1;
      return { kind: 'err', value: t.text as ExcelError };
    }
    if (takeOp('(')) {
      const e = comparison();
      expect(')');
      return e;
    }
    if (takeOp('+')) return primary();
    if (takeOp('-')) return { kind: 'un', op: '-', expr: primary() };
    if (t.type === 'ident') return identExpr();
    throw new ParseError(`unexpected ${t.text}`);
  };

  const identExpr = (): Ast => {
    const t = tokens[pos] as Token;
    const upper = t.text.toUpperCase();
    if (upper === 'TRUE' || upper === 'FALSE') {
      pos += 1;
      return { kind: 'bool', value: upper === 'TRUE' };
    }
    if (tokens[pos + 1]?.type === 'op' && tokens[pos + 1]?.text === '(') {
      pos += 2;
      const args: Ast[] = [];
      if (!takeOp(')')) {
        for (;;) {
          args.push(comparison());
          if (takeOp(',')) continue;
          expect(')');
          break;
        }
      }
      return { kind: 'call', name: upper, args };
    }
    const shape = parseRefShape(t.text);
    if (!shape) {
      pos += 1;
      return { kind: 'name', name: t.text };
    }
    if (shape.col === null) throw new ParseError(`bad ref ${t.text}`);
    pos += 1;
    let area: Area =
      shape.row === null
        ? { c1: shape.col, r1: 1, c2: shape.col, r2: MAX_ROW }
        : { c1: shape.col, r1: shape.row, c2: shape.col, r2: shape.row };
    if (takeOp(':')) {
      const t2 = tokens[pos];
      if (!t2 || (t2.type !== 'ident' && t2.type !== 'num')) throw new ParseError('bad range');
      pos += 1;
      const s2 = t2.type === 'num' ? { col: null, row: Number(t2.text) } : parseRefShape(t2.text);
      if (!s2) throw new ParseError('bad range');
      const a = shapeArea(
        shape.row === null ? { col: shape.col, row: null } : shape,
        s2.col === null ? { col: null, row: s2.row } : s2,
      );
      if (!a) throw new ParseError('bad range');
      area = a;
    }
    return { kind: 'ref', area };
  };

  const postfix = (): Ast => {
    let e = primary();
    while (takeOp('%')) e = { kind: 'pct', expr: e };
    return e;
  };

  const unary = (): Ast => {
    if (takeOp('-')) return { kind: 'un', op: '-', expr: unary() };
    if (takeOp('+')) return unary();
    return postfix();
  };

  const level = (next: () => Ast, ops: string): Ast => {
    let left = next();
    for (;;) {
      const op = takeOp(ops);
      if (!op) return left;
      left = { kind: 'bin', op, left, right: next() };
    }
  };

  const power = (): Ast => level(unary, '^');
  const mul = (): Ast => level(power, '*/');
  const add = (): Ast => level(mul, '+-');
  const concat = (): Ast => level(add, '&');
  const comparison = (): Ast => level(concat, '=<>');

  const ast = comparison();
  if (pos !== tokens.length) throw new ParseError('trailing tokens');
  return ast;
};

/** Parse formula text without the leading '='. Throws ParseError. */
export const parseFormulaBody = (body: string): Ast => parseTokens(tokenize(body));

/**
 * Parse a formula as typed, completing missing close-parentheses the way Excel does.
 * Returns the AST and the raw text to store (completed when needed), or null when
 * the formula is broken and must be kept as typed.
 */
export const parseFormula = (raw: string): { ast: Ast; raw: string } | null => {
  const body = raw.startsWith('=') ? raw.slice(1) : raw;
  for (let extra = 0; extra <= 8; extra += 1) {
    try {
      const candidate = body + ')'.repeat(extra);
      return { ast: parseFormulaBody(candidate), raw: '=' + candidate };
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
    }
  }
  return null;
};
