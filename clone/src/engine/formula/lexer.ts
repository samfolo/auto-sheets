/**
 * Turning a formula's text into tokens. The lexer knows nothing about grammar, so the parser
 * can read in the same order as Excel's precedence table.
 */
import { columnIndex, rowIndex } from '../address.js';
import { errorLiteral, type CellError } from '../values.js';
import type { RefPart } from './ast.js';

/** One piece of a formula. */
export type Token =
  | { k: 'number'; v: number }
  | { k: 'string'; v: string }
  | { k: 'ref'; v: RefPart }
  | { k: 'ident'; v: string }
  | { k: 'error'; v: CellError }
  | { k: 'op'; v: string }
  | { k: 'end' };

/** Every operator, longest first so `<=` beats `<`. */
const OPS = [
  '<=',
  '>=',
  '<>',
  '+',
  '-',
  '*',
  '/',
  '^',
  '%',
  '&',
  '=',
  '<',
  '>',
  '(',
  ')',
  ',',
  ':',
];

const NUMBER = /^\d*\.?\d+(?:[eE][+-]?\d+)?/;
const REFERENCE = /^\$?[A-Za-z]{1,3}\$?\d{1,7}/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_.]*/;
const ERROR = /^#[A-Za-z/0-9!?]+/;

const stringToken = (text: string, start: number): { token: Token; next: number } | null => {
  let j = start + 1;
  let value = '';
  while (j < text.length && text[j] !== '"') {
    value += text[j];
    j += 1;
  }
  if (j >= text.length) return null;
  return { token: { k: 'string', v: value }, next: j + 1 };
};

const errorToken = (text: string, start: number): { token: Token; next: number } | null => {
  const match = ERROR.exec(text.slice(start));
  const literal = match ? errorLiteral(match[0].toUpperCase()) : null;
  if (!match || !literal) return null;
  return { token: { k: 'error', v: literal }, next: start + match[0].length };
};

const numberToken = (text: string, start: number): { token: Token; next: number } | null => {
  const match = NUMBER.exec(text.slice(start));
  if (!match) return null;
  return { token: { k: 'number', v: Number(match[0]) }, next: start + match[0].length };
};

const refToken = (text: string, start: number): { token: Token; next: number } | null => {
  const match = REFERENCE.exec(text.slice(start));
  if (!match) return null;
  const parts = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})$/.exec(match[0]);
  if (!parts) return null;
  return {
    token: {
      k: 'ref',
      v: {
        absCol: parts[1] === '$',
        col: columnIndex(parts[2]!),
        absRow: parts[3] === '$',
        row: rowIndex(Number(parts[4])),
      },
    },
    next: start + match[0].length,
  };
};

const identToken = (text: string, start: number): { token: Token; next: number } | null => {
  const match = IDENT.exec(text.slice(start));
  if (!match) return null;
  return { token: { k: 'ident', v: match[0] }, next: start + match[0].length };
};

const operatorToken = (text: string, start: number): { token: Token; next: number } | null => {
  const op = OPS.find((candidate) => text.startsWith(candidate, start));
  if (!op) return null;
  return { token: { k: 'op', v: op }, next: start + op.length };
};

const isReference = (text: string, start: number): boolean =>
  REFERENCE.test(text.slice(start)) && !/[A-Za-z0-9_$]/.test(text[start - 1] ?? '');

/** Read the token beginning at `start`, or null when nothing valid starts there. */
const readToken = (
  text: string,
  start: number,
  ch: string,
): { token: Token; next: number } | null => {
  if (ch === '"') return stringToken(text, start);
  if (ch === '#') return errorToken(text, start);
  if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[start + 1] ?? ''))) {
    return numberToken(text, start);
  }
  if (/[A-Za-z$]/.test(ch)) {
    return isReference(text, start) ? refToken(text, start) : identToken(text, start);
  }
  return operatorToken(text, start);
};

/** Split a formula body into tokens, or null when a character cannot start a token. */
export const tokenize = (text: string): Token[] | null => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }
    const found = readToken(text, i, ch);
    if (!found) return null;
    tokens.push(found.token);
    i = found.next;
  }
  tokens.push({ k: 'end' });
  return tokens;
};

/** Count open brackets outside string literals. */
const unbalancedBrackets = (text: string): number => {
  let depth = 0;
  let inString = false;
  for (const ch of text) {
    if (ch === '"') inString = !inString;
    else if (!inString && ch === '(') depth += 1;
    else if (!inString && ch === ')') depth -= 1;
  }
  return depth;
};

/** Excel completes unclosed brackets at commit, so `=SUM(1,2` becomes `=SUM(1,2)`. */
export const completeFormula = (text: string): string => {
  const missing = unbalancedBrackets(text);
  return missing > 0 ? text + ')'.repeat(missing) : text;
};
