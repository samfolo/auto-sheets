// The selection model: areas, gestures, and how they move the active cell.

import {
  areaContains,
  colsArea,
  MAX_COL,
  MAX_ROW,
  normArea,
  rectBetween,
  rowsArea,
  wholeSheet,
  type Area,
  type CellAddr,
} from './address.ts';

export interface Selection {
  areas: Area[];
  active: CellAddr;
  focus: CellAddr;
  editing: boolean;
}

export interface Hold {
  shift?: boolean;
  cmd?: boolean;
}

/** Where a drag can start or end: a cell, a column header or a row header. */
export type DragEnd =
  | { type: 'cell'; cell: CellAddr }
  | { type: 'col'; col: number }
  | { type: 'row'; row: number };

export const initialSelection = (): Selection => {
  const a1 = { col: 1, row: 1 };
  return { areas: [{ c1: 1, r1: 1, c2: 1, r2: 1 }], active: a1, focus: a1, editing: false };
};

const single = (cell: CellAddr): Selection => ({
  areas: [{ c1: cell.col, r1: cell.row, c2: cell.col, r2: cell.row }],
  active: cell,
  focus: cell,
  editing: false,
});

const covered = (areas: Area[], cell: CellAddr): boolean =>
  areas.some((a) => areaContains(a, cell));

/** Whether whole column `col` lies inside one single area (the toggle test). */
const colCovered = (areas: Area[], col: number): boolean =>
  areas.some((a) => col >= a.c1 && col <= a.c2 && a.r1 === 1 && a.r2 === MAX_ROW);

/** Whether whole row `row` lies inside one single area (the toggle test). */
const rowCovered = (areas: Area[], row: number): boolean =>
  areas.some((a) => row >= a.r1 && row <= a.r2 && a.c1 === 1 && a.c2 === MAX_COL);

/** Remove a rectangle from an area, Excel's fragment order: below, right, left, above. */
export const subtractArea = (a: Area, r: Area): Area[] => {
  const ic1 = Math.max(a.c1, r.c1);
  const ic2 = Math.min(a.c2, r.c2);
  const ir1 = Math.max(a.r1, r.r1);
  const ir2 = Math.min(a.r2, r.r2);
  if (ic1 > ic2 || ir1 > ir2) return [a];
  const out: Area[] = [];
  if (ir2 < a.r2) out.push({ c1: a.c1, r1: ir2 + 1, c2: a.c2, r2: a.r2 });
  if (ic2 < a.c2) out.push({ c1: ic2 + 1, r1: ir1, c2: a.c2, r2: ir2 });
  if (ic1 > a.c1) out.push({ c1: a.c1, r1: ir1, c2: ic1 - 1, r2: ir2 });
  if (ir1 > a.r1) out.push({ c1: a.c1, r1: a.r1, c2: a.c2, r2: ir1 - 1 });
  return out;
};

/** Subtract a rectangle from the whole selection. */
const subtract = (sel: Selection, r: Area): Selection => {
  const holder =
    sel.areas.findLast((a) => areaContains(a, sel.active)) ?? sel.areas[sel.areas.length - 1];
  const areas = sel.areas.flatMap((a) => subtractArea(a, r));
  let active = holder ? { col: holder.c1, row: holder.r1 } : sel.active;
  if (areas.length > 0 && !covered(areas, active)) {
    const frags = holder ? subtractArea(holder, r) : [];
    const home = frags[0] ?? areas[areas.length - 1];
    active = home ? { col: home.c1, row: home.r1 } : active;
  }
  return { ...sel, areas, active, focus: active, editing: false };
};

const extendTo = (sel: Selection, cell: CellAddr): Selection => ({
  ...sel,
  areas: [rectBetween(sel.active, cell)],
  focus: cell,
  editing: false,
});

/** A fresh selection of the given areas; the active cell is the last area's top-left. */
const topLeftActive = (areas: Area[]): Selection => {
  const a = areas[areas.length - 1] as Area;
  const act = { col: a.c1, row: a.r1 };
  return { areas, active: act, focus: act, editing: false };
};

/** A plain click or a click with Shift or Command on a cell. */
export const clickCell = (sel: Selection, cell: CellAddr, hold: Hold): Selection => {
  if (hold.shift) return extendTo(sel, cell);
  if (hold.cmd) {
    if (covered(sel.areas, cell)) return subtract(sel, rectBetween(cell, cell));
    return { ...sel, areas: [...sel.areas, rectBetween(cell, cell)], active: cell, focus: cell, editing: false };
  }
  return single(cell);
};

/** Click a column header. */
export const clickCol = (sel: Selection, col: number, hold: Hold): Selection => {
  if (hold.shift)
    return { ...sel, areas: [colsArea(sel.active.col, col)], focus: { col, row: sel.active.row }, editing: false };
  if (hold.cmd) {
    if (colCovered(sel.areas, col)) return subtract(sel, colsArea(col, col));
    return topLeftActive([...sel.areas, colsArea(col, col)]);
  }
  return topLeftActive([colsArea(col, col)]);
};

/** Click a row header. */
export const clickRow = (sel: Selection, row: number, hold: Hold): Selection => {
  if (hold.shift) return { ...sel, areas: [rowsArea(sel.active.row, row)], focus: { col: sel.active.col, row }, editing: false };
  if (hold.cmd) {
    if (rowCovered(sel.areas, row)) return subtract(sel, rowsArea(row, row));
    return topLeftActive([...sel.areas, rowsArea(row, row)]);
  }
  return topLeftActive([rowsArea(row, row)]);
};

const addArea = (sel: Selection, area: Area, active: CellAddr): Selection => ({
  areas: [...sel.areas, area],
  active,
  focus: active,
  editing: false,
});

/** Drag from one place to another, with Shift or Command held or not. */
export const drag = (sel: Selection, from: DragEnd, to: DragEnd, hold: Hold): Selection => {
  if (from.type === 'col') return colDrag(sel, from.col, to, hold);
  if (from.type === 'row') return rowDrag(sel, from.row, to, hold);
  return cellDrag(sel, from.cell, to, hold);
};

const endCol = (to: DragEnd): number => (to.type === 'row' ? MAX_COL : to.type === 'col' ? to.col : to.cell.col);
const endRow = (to: DragEnd): number => (to.type === 'col' ? MAX_ROW : to.type === 'row' ? to.row : to.cell.row);

const colDrag = (sel: Selection, col: number, to: DragEnd, hold: Hold): Selection => {
  if (hold.shift)
    return {
      ...sel,
      areas: [normArea({ c1: sel.active.col, r1: sel.active.row, c2: endCol(to), r2: MAX_ROW })],
      editing: false,
    };
  const area = colsArea(col, endCol(to));
  const active = { col, row: 1 };
  if (hold.cmd) {
    if (colCovered(sel.areas, col)) return subtract(sel, area);
    return addArea(sel, area, active);
  }
  return { areas: [area], active, focus: active, editing: false };
};

const rowDrag = (sel: Selection, row: number, to: DragEnd, hold: Hold): Selection => {
  if (hold.shift)
    return {
      ...sel,
      areas: [normArea({ c1: sel.active.col, r1: sel.active.row, c2: MAX_COL, r2: endRow(to) })],
      editing: false,
    };
  const area = rowsArea(row, endRow(to));
  const active = { col: 1, row };
  if (hold.cmd) {
    if (rowCovered(sel.areas, row)) return subtract(sel, area);
    return addArea(sel, area, active);
  }
  return { areas: [area], active, focus: active, editing: false };
};

const cellDrag = (sel: Selection, from: CellAddr, to: DragEnd, hold: Hold): Selection => {
  const target: CellAddr =
    to.type === 'cell' ? to.cell : { col: endCol(to), row: endRow(to) };
  if (hold.shift) return extendTo(sel, target);
  const area = rectBetween(from, target);
  if (hold.cmd) {
    if (covered(sel.areas, from)) return subtract(sel, area);
    return addArea(sel, area, from);
  }
  return { areas: [area], active: from, focus: from, editing: false };
};

/** Click the select-all corner: everything, active cell A1. */
export const clickCorner = (): Selection => {
  const a1 = { col: 1, row: 1 };
  return { areas: [wholeSheet()], active: a1, focus: a1, editing: false };
};

/** Ctrl+A: the area holding the active cell becomes the whole sheet; active stays. */
export const selectAll = (sel: Selection): Selection => {
  const index = sel.areas.findIndex((a) => areaContains(a, sel.active));
  const areas = [...sel.areas];
  if (index >= 0) areas[index] = wholeSheet();
  else areas.push(wholeSheet());
  return { ...sel, areas, editing: false };
};

/** Name Box navigation: select the typed cell or range. */
export const selectArea = (area: Area): Selection => {
  const active = { col: area.c1, row: area.r1 };
  return { areas: [area], active, focus: active, editing: false };
};
