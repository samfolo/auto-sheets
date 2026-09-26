/**
 * Building the cell changes a content action produces: typing, Ctrl+Enter, Delete, fill
 * down, copy and paste. Everything here is pure so the session can record and undo it.
 */
import { MAX_ROWS, columnLetter, type Rect } from './address.js';
import { emptyCell, parseEntry } from './entry.js';
import type { CellChange } from './history.js';
import { shiftFormula } from './refs.js';
import type { Sheet } from './sheet.js';

/** The most cells one action will touch, so whole-column selections stay harmless. */
export const MAX_CELLS = 100000;

/** How many cells a rectangle holds. */
export const sizeOf = (rect: Rect): number => (rect.c2 - rect.c1 + 1) * (rect.r2 - rect.r1 + 1);

/** The address a cell change touches, for reports. */
export const addressOf = (col: number, row: number): string => `${columnLetter(col)}${row + 1}`;

/** One cell's change, or null when the content is unchanged. */
const changeFor = (
  sheet: Sheet,
  col: number,
  row: number,
  after: ReturnType<typeof parseEntry>,
): CellChange | null => {
  const before = sheet.get(col, row);
  if (before.raw === after.raw && before.kind === after.kind) return null;
  return { col, row, before, after };
};

/** The changes for typing text into one cell. */
export const changesForSet = (
  sheet: Sheet,
  col: number,
  row: number,
  text: string,
): CellChange[] => {
  const change = changeFor(sheet, col, row, parseEntry(text));
  return change ? [change] : [];
};

/** Visit the cells of a rectangle, up to a budget, as a grid of rows and columns. */
const eachCell = (
  area: Rect,
  budget: { left: number },
  visit: (col: number, row: number) => void,
): void => {
  for (let row = area.r1; row <= area.r2 && budget.left > 0; row += 1) {
    for (let col = area.c1; col <= area.c2 && budget.left > 0; col += 1) {
      budget.left -= 1;
      visit(col, row);
    }
  }
};

/** The changes for putting the same text into every cell of a selection. */
export const changesForTextInto = (sheet: Sheet, areas: Rect[], text: string): CellChange[] => {
  const after = parseEntry(text);
  const changes: CellChange[] = [];
  const budget = { left: MAX_CELLS };
  for (const area of areas) {
    eachCell(area, budget, (col, row) => {
      const change = changeFor(sheet, col, row, after);
      if (change) changes.push(change);
    });
  }
  return changes;
};

/** The changes for clearing everything inside a selection. */
export const changesForClear = (sheet: Sheet, areas: Rect[]): CellChange[] => {
  const changes: CellChange[] = [];
  for (const { col, row } of sheet.entries()) {
    if (
      areas.some((area) => col >= area.c1 && col <= area.c2 && row >= area.r1 && row <= area.r2)
    ) {
      changes.push({ col, row, before: sheet.get(col, row), after: emptyCell() });
    }
  }
  return changes;
};

/** Fill one column of an area down from its top cell. */
const fillColumn = (sheet: Sheet, area: Rect, col: number): CellChange[] => {
  const changes: CellChange[] = [];
  const top = sheet.get(col, area.r1).raw;
  for (let row = area.r1 + 1; row <= area.r2; row += 1) {
    const raw = top === '' ? '' : shiftFormula(top, row - area.r1, 0);
    const change = changeFor(sheet, col, row, raw === '' ? emptyCell() : parseEntry(raw));
    if (change) changes.push(change);
  }
  return changes;
};

/** The changes for filling each column of a selection down from its top row. */
export const changesForFillDown = (sheet: Sheet, areas: Rect[]): CellChange[] => {
  const changes: CellChange[] = [];
  for (const area of areas) {
    if (area.r1 >= area.r2) continue;
    for (let col = area.c1; col <= area.c2; col += 1) changes.push(...fillColumn(sheet, area, col));
  }
  return changes;
};

/** What a copy remembers: the block of raw contents and where it came from. */
export interface Clipboard {
  origin: { col: number; row: number };
  width: number;
  height: number;
  raws: string[][];
}

/** Copy the first selected area as a block of raw contents. */
export const buildClipboard = (sheet: Sheet, area: Rect): Clipboard => {
  const raws: string[][] = [];
  for (let row = area.r1; row <= area.r2; row += 1) {
    const line: string[] = [];
    for (let col = area.c1; col <= area.c2; col += 1) line.push(sheet.get(col, row).raw);
    raws.push(line);
  }
  return {
    origin: { col: area.c1, row: area.r1 },
    width: area.c2 - area.c1 + 1,
    height: area.r2 - area.r1 + 1,
    raws,
  };
};

/** The changes for pasting a copied block at the selection's active cell. */
export const changesForPaste = (
  sheet: Sheet,
  clipboard: Clipboard,
  active: { col: number; row: number },
): CellChange[] => {
  const dRow = active.row - clipboard.origin.row;
  const dCol = active.col - clipboard.origin.col;
  const changes: CellChange[] = [];
  for (let dr = 0; dr < clipboard.height; dr += 1) {
    for (let dc = 0; dc < clipboard.width; dc += 1) {
      const col = active.col + dc;
      const row = active.row + dr;
      if (col < 0 || row < 0 || row >= MAX_ROWS) continue;
      const raw = clipboard.raws[dr]?.[dc] ?? '';
      const shifted = raw === '' ? '' : shiftFormula(raw, dRow, dCol);
      const change = changeFor(sheet, col, row, shifted === '' ? emptyCell() : parseEntry(shifted));
      if (change) changes.push(change);
    }
  }
  return changes;
};
