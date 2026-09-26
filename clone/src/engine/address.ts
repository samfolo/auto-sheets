/**
 * A1-style cell addresses and rectangles, in both directions. These are the shared
 * vocabulary every other engine module uses to talk about places on the sheet.
 */

/** The sheet's full extent, matching Excel's limits. */
export const MAX_ROWS = 1048576;
/** The sheet's full extent, matching Excel's limits. */
export const MAX_COLS = 16384;

/** A rectangle of cells, inclusive, with c1 <= c2 and r1 <= r2. */
export interface Rect {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
}

/** A zero-based column index as its A1 letters, such as 0 -> A, 27 -> AB. */
export const columnLetter = (col: number): string => {
  let n = col + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

/** A1 letters as a zero-based column index, such as A -> 0, AB -> 27. */
export const columnIndex = (letters: string): number => {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
};

/** A zero-based row index as its 1-based number, such as 0 -> 1. */
export const rowNumber = (row: number): number => row + 1;

/** A 1-based row number as a zero-based index, such as 1 -> 0. */
export const rowIndex = (number: number): number => number - 1;

/** Render a rectangle the way Excel names it: B2, C3:E6, K:K, 5:5, A:XFD. */
export const formatRect = (rect: Rect): string => {
  const fullCols = rect.c1 === 0 && rect.c2 === MAX_COLS - 1;
  const fullRows = rect.r1 === 0 && rect.r2 === MAX_ROWS - 1;
  if (fullCols && fullRows) return 'A:XFD';
  if (fullRows) {
    return rect.c1 === rect.c2
      ? `${columnLetter(rect.c1)}:${columnLetter(rect.c1)}`
      : `${columnLetter(rect.c1)}:${columnLetter(rect.c2)}`;
  }
  if (fullCols) {
    return rect.r1 === rect.r2 ? `${rect.r1 + 1}:${rect.r1 + 1}` : `${rect.r1 + 1}:${rect.r2 + 1}`;
  }
  const first = `${columnLetter(rect.c1)}${rect.r1 + 1}`;
  const second = `${columnLetter(rect.c2)}${rect.r2 + 1}`;
  return first === second ? first : `${first}:${second}`;
};

/** Render a rectangle as a plain cell range, never using whole-column/row shorthand. */
export const formatCellRect = (rect: Rect): string => {
  const first = `${columnLetter(rect.c1)}${rect.r1 + 1}`;
  const second = `${columnLetter(rect.c2)}${rect.r2 + 1}`;
  return first === second ? first : `${first}:${second}`;
};

/** A1 notation as a rectangle; throws when the text is not an address. */
export const parseRect = (text: string): Rect => {
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})(?::([A-Z]{1,3})([1-9]\d{0,6}))?$/i.exec(text.trim());
  if (!match) throw new Error(`not a cell range: ${text}`);
  const c1 = columnIndex(match[1]!);
  const r1 = rowIndex(Number(match[2]));
  const c2 = match[3] ? columnIndex(match[3]) : c1;
  const r2 = match[4] ? rowIndex(Number(match[4])) : r1;
  return normalizeRect({ c1, r1, c2, r2 });
};

/** A whole column header such as B or AB as a one-column rectangle. */
export const columnRect = (letters: string): Rect => {
  const c = columnIndex(letters);
  return { c1: c, r1: 0, c2: c, r2: MAX_ROWS - 1 };
};

/** A whole row header such as 5 as a one-row rectangle. */
export const rowRect = (number: number): Rect => {
  const r = rowIndex(number);
  return { c1: 0, r1: r, c2: MAX_COLS - 1, r2: r };
};

/** The rectangle covering every cell. */
export const wholeSheetRect = (): Rect => ({ c1: 0, r1: 0, c2: MAX_COLS - 1, r2: MAX_ROWS - 1 });

/**
 * A rectangle as Excel's readout names it, in reverse: B2:C3, K:K, 5:5 and A:XFD all become
 * rectangles. Used by the screen to highlight exactly what the readout describes.
 */
export const parseArea = (text: string): Rect => {
  if (text === 'A:XFD') return wholeSheetRect();
  const columnRange = /^([A-Z]{1,3}):([A-Z]{1,3})$/.exec(text);
  if (columnRange) {
    const c1 = columnIndex(columnRange[1]!);
    const c2 = columnIndex(columnRange[2]!);
    return normalizeRect({ c1, r1: 0, c2, r2: MAX_ROWS - 1 });
  }
  const rowRange = /^([1-9]\d{0,6}):([1-9]\d{0,6})$/.exec(text);
  if (rowRange) {
    const r1 = rowIndex(Number(rowRange[1]));
    const r2 = rowIndex(Number(rowRange[2]));
    return normalizeRect({ c1: 0, r1, c2: MAX_COLS - 1, r2 });
  }
  return parseRect(text);
};

/** Put a rectangle's corners in order. */
export const normalizeRect = (rect: Rect): Rect => ({
  c1: Math.min(rect.c1, rect.c2),
  r1: Math.min(rect.r1, rect.r2),
  c2: Math.max(rect.c1, rect.c2),
  r2: Math.max(rect.r1, rect.r2),
});

/** True when the rectangle is a single cell. */
export const isSingleCell = (rect: Rect): boolean => rect.c1 === rect.c2 && rect.r1 === rect.r2;

/** True when the rectangle covers every row. */
export const isFullRows = (rect: Rect): boolean => rect.r1 === 0 && rect.r2 === MAX_ROWS - 1;

/** True when the rectangle covers every column. */
export const isFullCols = (rect: Rect): boolean => rect.c1 === 0 && rect.c2 === MAX_COLS - 1;

/** The rectangle spanning two cells or two rectangles. */
export const spanRects = (a: Rect, b: Rect): Rect =>
  normalizeRect({ c1: a.c1, r1: a.r1, c2: b.c2, r2: b.r2 });

/** The address of a cell inside a rectangle. */
export const cellAddress = (rect: Rect): string => `${columnLetter(rect.c1)}${rect.r1 + 1}`;

/** The top-left cell of a rectangle as its own rectangle. */
export const topLeft = (rect: Rect): Rect => ({
  c1: rect.c1,
  r1: rect.r1,
  c2: rect.c1,
  r2: rect.r1,
});
