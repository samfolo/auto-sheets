/**
 * Shifting the references inside a formula's text, as Excel does when a formula is copied,
 * filled or pasted: relative parts move with the formula, `$` parts stay put.
 */
import { MAX_COLS, MAX_ROWS, columnIndex, columnLetter } from './address.js';

const REFERENCE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/;

/** The shifted text of a reference at the start of `raw.slice(start)`, or null. */
const shiftedReference = (
  raw: string,
  start: number,
  dRow: number,
  dCol: number,
): { text: string; length: number } | null => {
  const match = REFERENCE.exec(raw.slice(start));
  if (!match || /[A-Za-z0-9_$]/.test(raw[start - 1] ?? '')) return null;
  const [, absCol, letters, absRow, digits] = match;
  let col = columnIndex(letters!);
  let row = Number(digits) - 1;
  if (absCol !== '$') col += dCol;
  if (absRow !== '$') row += dRow;
  const text =
    col < 0 || row < 0 || col >= MAX_COLS || row >= MAX_ROWS
      ? '#REF!'
      : `${absCol}${columnLetter(col)}${absRow}${row + 1}`;
  return { text, length: match[0].length };
};

/** The copied run of a quoted string starting at `start`, and where it ends. */
const stringRun = (raw: string, start: number): { text: string; next: number } => {
  let end = start + 1;
  while (end < raw.length && raw[end] !== '"') end += 1;
  return {
    text: raw.slice(start, Math.min(end + 1, raw.length)),
    next: Math.min(end + 1, raw.length),
  };
};

/** Shift every relative reference in a formula by the given row and column offsets. */
export const shiftFormula = (raw: string, dRow: number, dCol: number): string => {
  if (!raw.startsWith('=')) return raw;
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === '"') {
      const run = stringRun(raw, i);
      out += run.text;
      i = run.next;
      continue;
    }
    const reference = shiftedReference(raw, i, dRow, dCol);
    if (reference) {
      out += reference.text;
      i += reference.length;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
};
