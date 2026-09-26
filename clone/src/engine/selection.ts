/**
 * The selection: which rectangles are selected, where the active cell is, and the
 * screen-reader readout Excel produces for it.
 */
import {
  MAX_COLS,
  MAX_ROWS,
  formatRect,
  isSingleCell,
  normalizeRect,
  spanRects,
  type Rect,
} from './address.js';
import type { Sheet } from './sheet.js';

/** A cell's zero-based position. */
export interface CellPoint {
  col: number;
  row: number;
}

/** The whole selection, including the anchor Shift gestures extend from. */
export interface SelectionState {
  areas: Rect[];
  active: CellPoint;
  anchor: CellPoint;
  /** The moving corner Shift gestures extend to; equal to the active cell otherwise. */
  focus: CellPoint;
}

/** A selection holding one cell. */
export const singleSelection = (col: number, row: number): SelectionState => ({
  areas: [{ c1: col, r1: row, c2: col, r2: row }],
  active: { col, row },
  anchor: { col, row },
  focus: { col, row },
});

/** True when a cell lies inside any selected area. */
export const isSelected = (selection: SelectionState, col: number, row: number): boolean =>
  selection.areas.some(
    (area) => col >= area.c1 && col <= area.c2 && row >= area.r1 && row <= area.r2,
  );

const contains = (outer: Rect, inner: Rect): boolean =>
  inner.c1 >= outer.c1 && inner.c2 <= outer.c2 && inner.r1 >= outer.r1 && inner.r2 <= outer.r2;

/** True when a rectangle lies entirely inside any selected area. */
export const isRectSelected = (selection: SelectionState, rect: Rect): boolean =>
  selection.areas.some((area) => contains(area, rect));

const overlap = (a: Rect, b: Rect): Rect | null => {
  const c1 = Math.max(a.c1, b.c1);
  const r1 = Math.max(a.r1, b.r1);
  const c2 = Math.min(a.c2, b.c2);
  const r2 = Math.min(a.r2, b.r2);
  if (c1 > c2 || r1 > r2) return null;
  return { c1, r1, c2, r2 };
};

/**
 * Remove a rectangle from an area, the way Excel splits one: what is below the cut first,
 * then to the right, then to the left, then above it.
 */
export const subtractRect = (area: Rect, cut: Rect): Rect[] => {
  const shared = overlap(area, cut);
  if (!shared) return [area];
  const parts: Rect[] = [];
  if (shared.r2 < area.r2) {
    parts.push({ c1: area.c1, r1: shared.r2 + 1, c2: area.c2, r2: area.r2 });
  }
  if (shared.c2 < area.c2) {
    parts.push({
      c1: shared.c2 + 1,
      r1: Math.max(area.r1, shared.r1),
      c2: area.c2,
      r2: Math.min(area.r2, shared.r2),
    });
  }
  if (shared.c1 > area.c1) {
    parts.push({
      c1: area.c1,
      r1: Math.max(area.r1, shared.r1),
      c2: shared.c1 - 1,
      r2: Math.min(area.r2, shared.r2),
    });
  }
  if (shared.r1 > area.r1) {
    parts.push({ c1: area.c1, r1: area.r1, c2: area.c2, r2: shared.r1 - 1 });
  }
  return parts;
};

/** The result of cutting a rectangle out of a selection, and where the active cell lands. */
export const subtractFromSelection = (
  selection: SelectionState,
  cut: Rect,
): { areas: Rect[]; lastPart?: Rect } => {
  const areas: Rect[] = [];
  let lastPart: Rect | undefined;
  for (const area of selection.areas) {
    for (const part of subtractRect(area, cut)) {
      areas.push(part);
      lastPart = part;
    }
  }
  return { areas, lastPart };
};

/** Add a rectangle to a selection, keeping it as its own area. */
export const addArea = (
  selection: SelectionState,
  rect: Rect,
  active: CellPoint,
): SelectionState => ({
  areas: [...selection.areas, normalizeRect(rect)],
  active,
  anchor: active,
  focus: active,
});

/** Extend the selection to a rectangle's far corner, keeping the anchor active. */
export const extendTo = (selection: SelectionState, corner: Rect): SelectionState => {
  const anchor: Rect = {
    c1: selection.anchor.col,
    r1: selection.anchor.row,
    c2: selection.anchor.col,
    r2: selection.anchor.row,
  };
  return {
    areas: [spanRects(corner, anchor)],
    active: selection.anchor,
    anchor: selection.anchor,
    focus: { col: corner.c1, row: corner.r1 },
  };
};

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);

/** Move the active cell by a delta, collapsing to a single-cell selection. */
export const moveActive = (
  selection: SelectionState,
  dCol: number,
  dRow: number,
): SelectionState => {
  const col = clamp(selection.active.col + dCol, MAX_COLS - 1);
  const row = clamp(selection.active.row + dRow, MAX_ROWS - 1);
  return singleSelection(col, row);
};

/** Extend the selection by a delta from the anchor (Shift+arrow). */
export const extendBy = (selection: SelectionState, dCol: number, dRow: number): SelectionState => {
  const col = clamp(selection.focus.col + dCol, MAX_COLS - 1);
  const row = clamp(selection.focus.row + dRow, MAX_ROWS - 1);
  const corner: Rect = { c1: col, r1: row, c2: col, r2: row };
  return extendTo(selection, corner);
};

/** The screen-reader readout for the current selection. */
export const readout = (selection: SelectionState, sheet: Sheet, editing: boolean): string => {
  if (editing) return 'Editing';
  const { areas, active } = selection;
  if (areas.length > 1) {
    return `${areas.length} ranges selected . ${areas.map(formatRect).join(' . ')} . `;
  }
  const area = areas[0] ?? pointRect(active);
  const view = sheet.view(active.col, active.row);
  const annotation = view.annotations[0];
  if (isSingleCell(area)) {
    const parts: string[] = [];
    if (view.display !== '') parts.push(view.display);
    parts.push(addressOf(active));
    if (annotation) parts.push(annotation);
    return `${parts.join(' . ')} . `;
  }
  const parts: string[] = [];
  if (view.display !== '') parts.push(view.display);
  parts.push('Selected range');
  parts.push(formatRect(area));
  if (annotation) parts.push(annotation);
  return `${parts.join(' . ')} . `;
};

const addressOf = (point: CellPoint): string => formatRect(pointRect(point));

const pointRect = (point: CellPoint): Rect => ({
  c1: point.col,
  r1: point.row,
  c2: point.col,
  r2: point.row,
});
