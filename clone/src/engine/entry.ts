/**
 * How a typed entry becomes a cell: the number, date, text and formula rules Excel applies.
 */
import type { Expr } from './formula/ast.js';
import { completeFormula } from './formula/lexer.js';
import { parseFormula } from './formula/parser.js';
import {
  dateToSerial,
  errorLiteral,
  type CellError,
  type NumberFormat,
  type Scalar,
} from './values.js';

/** A stored cell: the text the formula bar shows plus what the sheet made of it. */
export interface Cell {
  raw: string;
  kind: 'empty' | 'number' | 'text' | 'boolean' | 'error' | 'formula';
  number?: number;
  text?: string;
  bool?: boolean;
  error?: CellError;
  format: NumberFormat;
  ast?: Expr;
  parseError?: boolean;
  /** Cached result of the formula, dropped whenever the sheet changes. */
  computed?: Scalar | null;
}

/** The blank cell. */
export const emptyCell = (): Cell => ({ raw: '', kind: 'empty', format: 'general' });

/** Normalise a numeric string the way Excel stores it: no leading zeros, no trailing zeros. */
const canonicalNumber = (text: string): string => {
  const value = Number(text);
  if (!Number.isFinite(value)) return text;
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  return String(value);
};

const DATE_PATTERNS = [
  /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/,
  /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/,
  /^(\d{1,2})\/(\d{1,2})$/,
  /^(\d{1,2})-(\d{1,2})$/,
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const fullYear = (value: number): number => (value < 100 ? 2000 + value : value);

/** A typed date such as 1/2 or 9/5/2002, or null when the text is not a date. */
const parseDate = (text: string): { serial: number; raw: string } | null => {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const year = match[3] ? fullYear(Number(match[3])) : new Date().getFullYear();
    return { serial: dateToSerial(year, month, day), raw: `${month}/${day}/${year}` };
  }
  const named = /^([a-z]{3})-?(\d{1,2})(?:-(\d{2,4}))?$/i.exec(text);
  if (named) {
    const month = MONTHS.indexOf(named[1]!.toLowerCase()) + 1;
    if (month > 0) {
      const year = named[3] ? fullYear(Number(named[3])) : new Date().getFullYear();
      return { serial: dateToSerial(year, month, Number(named[2])), raw: text };
    }
  }
  return null;
};

/** A formula cell, kept as typed when it cannot be parsed. */
const formulaCell = (text: string): Cell => {
  const completed = completeFormula(text);
  const ast = parseFormula(completed);
  if (!ast) return { raw: text, kind: 'formula', format: 'general', parseError: true };
  return { raw: completed, kind: 'formula', format: 'general', ast };
};

/** The numeric interpretations of a typed entry, or null when it is not a number. */
const numberCell = (text: string): Cell | null => {
  const percent = /^([+-]?(?:\d+\.?\d*|\.\d+))%$/.exec(text);
  if (percent) {
    return {
      raw: `${canonicalNumber(percent[1]!)}%`,
      kind: 'number',
      number: Number(percent[1]) / 100,
      format: 'percent',
    };
  }
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?\d+$/.test(text)) {
    const value = Number(text);
    if (Number.isFinite(value)) {
      return {
        raw: canonicalNumber(String(value)),
        kind: 'number',
        number: value,
        format: 'scientific',
      };
    }
  }
  const negative = /^\((\d+\.?\d*|\.\d+)\)$/.exec(text);
  if (negative) {
    const value = -Number(negative[1]);
    return {
      raw: canonicalNumber(String(value)),
      kind: 'number',
      number: value,
      format: 'general',
    };
  }
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    return { raw: canonicalNumber(text), kind: 'number', number: Number(text), format: 'general' };
  }
  return null;
};

/** Interpret what a person typed, returning the cell Excel would store. */
export const parseEntry = (text: string): Cell => {
  if (text === '') return emptyCell();
  if (text.startsWith("'"))
    return { raw: text, kind: 'text', text: text.slice(1), format: 'general' };
  if (text.startsWith('=')) return formulaCell(text);
  const upper = text.toUpperCase();
  if (upper === 'TRUE' || upper === 'FALSE') {
    return { raw: upper, kind: 'boolean', bool: upper === 'TRUE', format: 'general' };
  }
  const literal = errorLiteral(upper);
  if (literal) return { raw: upper, kind: 'error', error: literal, format: 'general' };
  const numeric = numberCell(text);
  if (numeric) return numeric;
  const date = parseDate(text.trim());
  if (date && text.trim() === text) {
    return { raw: date.raw, kind: 'number', number: date.serial, format: 'date' };
  }
  return { raw: text, kind: 'text', text, format: 'general' };
};
