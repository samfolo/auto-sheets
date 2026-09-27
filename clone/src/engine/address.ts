// Cell and range addresses: parsing, formatting and the sheet's bounds.

export const MAX_COL = 16384; // XFD
export const MAX_ROW = 1048576;

export interface CellAddr {
  col: number; // 1-based
  row: number; // 1-based
}

export interface Area {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
}

/** Column letters to 1-based index: A→1, XFD→16384. */
export const colToIndex = (letters: string): number => {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};

/** 1-based index to column letters: 1→A. */
export const indexToCol = (index: number): string => {
  let s = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** Format a cell as A1 notation. */
export const cellName = (cell: CellAddr): string => `${indexToCol(cell.col)}${cell.row}`;

/** Parse a cell address such as B7, with optional $ markers. Null when invalid. */
export const parseCell = (text: string): CellAddr | null => {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(text.trim());
  if (!m || !m[1] || !m[2]) return null;
  const col = colToIndex(m[1]);
  const row = Number(m[2]);
  if (col < 1 || col > MAX_COL || row < 1 || row > MAX_ROW) return null;
  return { col, row };
};

/** Normalise an area so c1<=c2 and r1<=r2. */
export const normArea = (a: Area): Area => ({
  c1: Math.min(a.c1, a.c2),
  c2: Math.max(a.c1, a.c2),
  r1: Math.min(a.r1, a.r2),
  r2: Math.max(a.r1, a.r2),
});

/** The rectangle between two cells. */
export const rectBetween = (a: CellAddr, b: CellAddr): Area =>
  normArea({ c1: a.col, r1: a.row, c2: b.col, r2: b.row });

/** Whole columns c1..c2. */
export const colsArea = (c1: number, c2: number): Area =>
  normArea({ c1, r1: 1, c2, r2: MAX_ROW });

/** Whole rows r1..r2. */
export const rowsArea = (r1: number, r2: number): Area =>
  normArea({ c1: 1, r1, c2: MAX_COL, r2 });

/** The whole sheet, A:XFD. */
export const wholeSheet = (): Area => ({ c1: 1, r1: 1, c2: MAX_COL, r2: MAX_ROW });

/** Whether the area is exactly one cell. */
export const isSingleCell = (a: Area): boolean =>
  a.c1 === a.c2 && a.r1 === a.r2 && a.c2 !== MAX_COL && a.r2 !== MAX_ROW;

/** Whether the area covers whole columns (every row). */
export const isFullCols = (a: Area): boolean => a.r1 === 1 && a.r2 === MAX_ROW;

/** Whether the area covers whole rows (every column). */
export const isFullRows = (a: Area): boolean => a.c1 === 1 && a.c2 === MAX_COL;

/** Whether a cell lies inside an area. */
export const areaContains = (a: Area, cell: CellAddr): boolean =>
  cell.col >= a.c1 && cell.col <= a.c2 && cell.row >= a.r1 && cell.row <= a.r2;

/** The name the readout gives an area: B2, B2:C4, B:D, 5:6 or A:XFD. */
export const areaName = (a: Area): string => {
  if (isFullCols(a) && isFullRows(a)) return 'A:XFD';
  if (isFullCols(a)) {
    const c1 = indexToCol(a.c1);
    const c2 = indexToCol(a.c2);
    return c1 === c2 ? `${c1}:${c1}` : `${c1}:${c2}`;
  }
  if (isFullRows(a)) return a.r1 === a.r2 ? `${a.r1}:${a.r1}` : `${a.r1}:${a.r2}`;
  const tl = cellName({ col: a.c1, row: a.r1 });
  if (a.c1 === a.c2 && a.r1 === a.r2) return tl;
  return `${tl}:${cellName({ col: a.c2, row: a.r2 })}`;
};

/** Parse a name-box target: one cell or one rectangle. */
export const parseArea = (text: string): Area | null => {
  const t = text.trim();
  const single = parseCell(t);
  if (single) return { c1: single.col, r1: single.row, c2: single.col, r2: single.row };
  const parts = t.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const a = parseCell(parts[0]);
  const b = parseCell(parts[1]);
  if (a && b) return rectBetween(a, b);
  if (/^[A-Za-z]{1,3}$/.test(parts[0]) && /^[A-Za-z]{1,3}$/.test(parts[1]))
    return colsArea(colToIndex(parts[0]), colToIndex(parts[1]));
  if (/^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]))
    return rowsArea(Number(parts[0]), Number(parts[1]));
  return null;
};
