// Rewrites a formula's cell references when it is copied, filled or pasted.

import { indexToCol, colToIndex, MAX_COL, MAX_ROW } from './address.ts';

const REF_RE = /(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/g;

/**
 * Shift every relative reference in a formula by (dCol, dRow). Absolute ($) parts
 * stay. References that would leave the grid become #REF!.
 * Text inside double-quoted strings is left alone.
 */
export const shiftFormulaRefs = (raw: string, dCol: number, dRow: number): string => {
  const body = raw;
  let out = '';
  let i = 0;
  while (i < body.length) {
    if (body[i] === '"') {
      let end = i + 1;
      while (end < body.length && body[end] !== '"') end += body[end + 1] === '"' ? 2 : 1;
      out += body.slice(i, Math.min(end + 1, body.length));
      i = Math.min(end + 1, body.length);
      continue;
    }
    REF_RE.lastIndex = i;
    const m = REF_RE.exec(body);
    if (!m || m.index !== i) {
      out += body[i];
      i += 1;
      continue;
    }
    out += shiftRef(m, dCol, dRow);
    i += m[0].length;
  }
  return out;
};

const shiftRef = (m: RegExpExecArray, dCol: number, dRow: number): string => {
  const absCol = m[1] === '$';
  const absRow = m[3] === '$';
  const letters = (m[2] ?? '').toUpperCase();
  const col = colToIndex(letters);
  if (col > MAX_COL) return m[0];
  const row = Number(m[4]);
  const newCol = absCol ? col : col + dCol;
  const newRow = absRow ? row : row + dRow;
  if (newCol < 1 || newCol > MAX_COL || newRow < 1 || newRow > MAX_ROW) return '#REF!';
  return `${absCol ? '$' : ''}${indexToCol(newCol)}${absRow ? '$' : ''}${newRow}`;
};
