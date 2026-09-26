/**
 * Turning mouse gestures and key presses into a new selection, following Excel's rules for
 * clicking, dragging, Shift extension and Command toggling of separate areas.
 */
import {
  MAX_COLS,
  MAX_ROWS,
  normalizeRect,
  spanRects,
  wholeSheetRect,
  type Rect,
} from './address.js';
import {
  addArea,
  extendTo,
  isRectSelected,
  isSelected,
  moveActive,
  singleSelection,
  subtractFromSelection,
  type CellPoint,
  type SelectionState,
} from './selection.js';

/** Where a gesture touched: a cell, a whole column or a whole row. */
export type Endpoint =
  | { kind: 'cell'; col: number; row: number }
  | { kind: 'column'; col: number }
  | { kind: 'row'; row: number };

const pointOf = (endpoint: Endpoint): CellPoint =>
  endpoint.kind === 'cell'
    ? { col: endpoint.col, row: endpoint.row }
    : endpoint.kind === 'column'
      ? { col: endpoint.col, row: 0 }
      : { col: 0, row: endpoint.row };

const cellOf = (endpoint: Endpoint): Rect => {
  const point = pointOf(endpoint);
  return { c1: point.col, r1: point.row, c2: point.col, r2: point.row };
};

const columnOf = (col: number): Rect => ({ c1: col, r1: 0, c2: col, r2: MAX_ROWS - 1 });
const rowOf = (row: number): Rect => ({ c1: 0, r1: row, c2: MAX_COLS - 1, r2: row });

const anchorRect = (selection: SelectionState): Rect =>
  cellOf({
    kind: 'cell',
    col: selection.anchor.col,
    row: selection.anchor.row,
  });

const pointOfRect = (rect: Rect): CellPoint => ({ col: rect.c1, row: rect.r1 });

/** The rectangle a drag covers: cells span, header ends take whole columns or rows. */
const dragRect = (from: Endpoint, to: Endpoint): Rect => {
  if (from.kind === 'column' || to.kind === 'column') {
    const fromCol = from.kind === 'row' ? 0 : from.col;
    const toCol = to.kind === 'row' ? 0 : to.col;
    return normalizeRect({ c1: fromCol, c2: toCol, r1: 0, r2: MAX_ROWS - 1 });
  }
  if (from.kind === 'row' || to.kind === 'row') {
    return normalizeRect({ r1: from.row, r2: to.row, c1: 0, c2: MAX_COLS - 1 });
  }
  return spanRects(cellOf(from), cellOf(to));
};

/**
 * A Shift drag that starts on a header extends the anchor's row or column toward the pointer,
 * never past the anchor: when the pointer goes behind the anchor it runs to the sheet's edge.
 * Inferred from `explore/seed-1-2`, the one recording of this gesture.
 */
const extendFromHeader = (
  selection: SelectionState,
  from: Endpoint,
  to: Endpoint,
): SelectionState | null => {
  if (from.kind === 'row' && to.kind === 'cell') {
    const c2 = to.col >= selection.anchor.col ? to.col : MAX_COLS - 1;
    return {
      areas: [
        normalizeRect({
          c1: selection.anchor.col,
          r1: selection.anchor.row,
          c2,
          r2: selection.anchor.row,
        }),
      ],
      active: selection.anchor,
      anchor: selection.anchor,
      focus: { col: c2, row: selection.anchor.row },
    };
  }
  if (from.kind === 'column' && to.kind === 'cell') {
    const r2 = to.row >= selection.anchor.row ? to.row : MAX_ROWS - 1;
    return {
      areas: [
        normalizeRect({
          c1: selection.anchor.col,
          r1: selection.anchor.row,
          c2: selection.anchor.col,
          r2,
        }),
      ],
      active: selection.anchor,
      anchor: selection.anchor,
      focus: { col: selection.anchor.col, row: r2 },
    };
  }
  return null;
};

/** Extend the current selection to an endpoint, from the anchor. */
const extendFromAnchor = (selection: SelectionState, endpoint: Endpoint): SelectionState => {
  if (endpoint.kind === 'cell') return extendTo(selection, cellOf(endpoint));
  const area =
    endpoint.kind === 'column'
      ? normalizeRect({ c1: selection.anchor.col, c2: endpoint.col, r1: 0, r2: MAX_ROWS - 1 })
      : normalizeRect({ r1: selection.anchor.row, r2: endpoint.row, c1: 0, c2: MAX_COLS - 1 });
  return {
    areas: [area],
    active: selection.anchor,
    anchor: selection.anchor,
    focus: pointOf(endpoint),
  };
};

/** A click on a cell. */
export const applyClick = (
  selection: SelectionState,
  col: number,
  row: number,
  hold: string[],
): SelectionState => {
  const cell: Rect = { c1: col, r1: row, c2: col, r2: row };
  if (hold.includes('Shift')) return extendFromAnchor(selection, { kind: 'cell', col, row });
  if (hold.includes('Command')) {
    if (isSelected(selection, col, row)) {
      const { areas } = subtractFromSelection(selection, cell);
      const last = selection.areas[selection.areas.length - 1];
      const active = last ? pointOfRect(last) : selection.active;
      return { areas, active, anchor: selection.anchor, focus: active };
    }
    return addArea(selection, cell, { col, row });
  }
  return singleSelection(col, row);
};

/** A drag between two endpoints, with Shift extending and Command toggling. */
export const applyDrag = (
  selection: SelectionState,
  from: Endpoint,
  to: Endpoint,
  hold: string[],
): SelectionState => {
  if (hold.includes('Shift')) {
    return extendFromHeader(selection, from, to) ?? extendFromAnchor(selection, to);
  }
  const target = normalizeRect(dragRect(from, to));
  const start = pointOf(from);
  if (hold.includes('Command')) {
    const startHeader =
      from.kind === 'column' ? columnOf(from.col) : from.kind === 'row' ? rowOf(from.row) : null;
    const shouldSubtract = startHeader
      ? isRectSelected(selection, startHeader)
      : isSelected(selection, start.col, start.row);
    if (shouldSubtract) {
      const { areas, lastPart } = subtractFromSelection(selection, target);
      const active = lastPart ? pointOfRect(lastPart) : selection.active;
      return { areas, active, anchor: selection.anchor, focus: active };
    }
    return addArea(selection, target, start);
  }
  return { areas: [target], active: start, anchor: start, focus: start };
};

/** A click on a column header. */
export const applyColumnClick = (
  selection: SelectionState,
  col: number,
  hold: string[],
): SelectionState => {
  if (hold.includes('Shift')) return extendFromAnchor(selection, { kind: 'column', col });
  const area = columnOf(col);
  if (hold.includes('Command')) {
    if (isRectSelected(selection, area)) {
      const { areas, lastPart } = subtractFromSelection(selection, area);
      const active = lastPart ? pointOfRect(lastPart) : selection.active;
      return { areas, active, anchor: selection.anchor, focus: active };
    }
    return addArea(selection, area, { col, row: 0 });
  }
  return {
    areas: [area],
    active: { col, row: 0 },
    anchor: { col, row: 0 },
    focus: { col, row: 0 },
  };
};

/** A click on a row header. */
export const applyRowClick = (
  selection: SelectionState,
  row: number,
  hold: string[],
): SelectionState => {
  if (hold.includes('Shift')) return extendFromAnchor(selection, { kind: 'row', row });
  const area = rowOf(row);
  if (hold.includes('Command')) {
    if (isRectSelected(selection, area)) {
      const { areas, lastPart } = subtractFromSelection(selection, area);
      const active = lastPart ? pointOfRect(lastPart) : selection.active;
      return { areas, active, anchor: selection.anchor, focus: active };
    }
    return addArea(selection, area, { col: 0, row });
  }
  return {
    areas: [area],
    active: { col: 0, row },
    anchor: { col: 0, row },
    focus: { col: 0, row },
  };
};

/** Click the select-all corner. */
export const applyCorner = (): SelectionState => ({
  areas: [wholeSheetRect()],
  active: { col: 0, row: 0 },
  anchor: { col: 0, row: 0 },
  focus: { col: 0, row: 0 },
});

/** Command+A: select everything, keeping earlier areas and the active cell. */
export const applySelectAll = (selection: SelectionState): SelectionState => {
  const kept = selection.areas.length > 1 ? selection.areas.slice(0, -1) : [];
  return {
    areas: [...kept, wholeSheetRect()],
    active: selection.active,
    anchor: selection.anchor,
    focus: selection.active,
  };
};

/** Move the active cell one step, as the arrow keys and Tab do. */
export const applyMove = (selection: SelectionState, dCol: number, dRow: number): SelectionState =>
  moveActive(selection, dCol, dRow);

/** Move the active cell within its selection without changing the selection. */
export const applyMoveWithin = (
  selection: SelectionState,
  dCol: number,
  dRow: number,
): SelectionState => {
  const area = selection.areas[0];
  if (!area) return selection;
  const col = Math.min(Math.max(selection.active.col + dCol, area.c1), area.c2);
  const row = Math.min(Math.max(selection.active.row + dRow, area.r1), area.r2);
  return { ...selection, active: { col, row }, focus: { col, row } };
};

/** Shift+arrow extends from the anchor. */
export const applyExtend = (
  selection: SelectionState,
  dCol: number,
  dRow: number,
): SelectionState => {
  const col = Math.min(Math.max(selection.focus.col + dCol, 0), MAX_COLS - 1);
  const row = Math.min(Math.max(selection.focus.row + dRow, 0), MAX_ROWS - 1);
  return {
    areas: [spanRects(anchorRect(selection), { c1: col, r1: row, c2: col, r2: row })],
    active: selection.anchor,
    anchor: selection.anchor,
    focus: { col, row },
  };
};
