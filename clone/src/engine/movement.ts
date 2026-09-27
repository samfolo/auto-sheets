// How keys move the active cell: arrows collapse, Enter/Tab move inside the selection.

import { areaContains, MAX_COL, MAX_ROW, rectBetween, type Area } from './address.ts';
import type { Selection } from './selection.ts';

const clampCell = (col: number, row: number): { col: number; row: number } => ({
  col: Math.min(Math.max(col, 1), MAX_COL),
  row: Math.min(Math.max(row, 1), MAX_ROW),
});

const singleAt = (sel: Selection, col: number, row: number): Selection => {
  const active = clampCell(col, row);
  return { ...sel, areas: [{ c1: active.col, r1: active.row, c2: active.col, r2: active.row }], active, focus: active };
};

/** The selection area the active cell moves within (usually the one holding it). */
const activeArea = (sel: Selection): Area =>
  sel.areas.find((a) => areaContains(a, sel.active)) ?? (sel.areas[sel.areas.length - 1] as Area);

/** Move within an area, wrapping around its edges like Excel's Enter and Tab. */
const moveWithin = (sel: Selection, area: Area, dr: number, dc: number): Selection => {
  let { col, row } = sel.active;
  if (dr !== 0) {
    row += dr;
    if (row > area.r2) {
      row = area.r1;
      col += 1;
    }
    if (row < area.r1) {
      row = area.r2;
      col -= 1;
    }
    if (col > area.c2) col = area.c1;
    if (col < area.c1) col = area.c2;
  } else {
    col += dc;
    if (col > area.c2) {
      col = area.c1;
      row += 1;
    }
    if (col < area.c1) {
      col = area.c2;
      row -= 1;
    }
    if (row > area.r2) row = area.r1;
    if (row < area.r1) row = area.r2;
  }
  const active = clampCell(col, row);
  return { ...sel, active, focus: active };
};

/** Shift+arrow: grow or shrink the selection by moving the focus corner. */
const extendBy = (sel: Selection, dr: number, dc: number): Selection => {
  const focus = clampCell(sel.focus.col + dc, sel.focus.row + dr);
  return { ...sel, areas: [rectBetween(sel.active, focus)], focus };
};

/** Handle a movement key. */
export const keyMove = (sel: Selection, key: string, shift: boolean): Selection => {
  switch (key) {
    case 'ArrowDown':
      return shift ? extendBy(sel, 1, 0) : singleAt(sel, sel.active.col, sel.active.row + 1);
    case 'ArrowUp':
      return shift ? extendBy(sel, -1, 0) : singleAt(sel, sel.active.col, sel.active.row - 1);
    case 'ArrowRight':
      return shift ? extendBy(sel, 0, 1) : singleAt(sel, sel.active.col + 1, sel.active.row);
    case 'ArrowLeft':
      return shift ? extendBy(sel, 0, -1) : singleAt(sel, sel.active.col - 1, sel.active.row);
    case 'Enter': {
      const area = activeArea(sel);
      const singleCell = area.c1 === area.c2 && area.r1 === area.r2;
      if (singleCell) return singleAt(sel, sel.active.col, sel.active.row + (shift ? -1 : 1));
      return moveWithin(sel, area, shift ? -1 : 1, 0);
    }
    case 'Tab': {
      const area = activeArea(sel);
      const singleCell = area.c1 === area.c2 && area.r1 === area.r2;
      if (singleCell) return singleAt(sel, sel.active.col + (shift ? -1 : 1), sel.active.row);
      return moveWithin(sel, area, 0, shift ? -1 : 1);
    }
    case 'Home':
      return singleAt(sel, 1, sel.active.row);
    default:
      return sel;
  }
};
