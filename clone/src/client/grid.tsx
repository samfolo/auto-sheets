// The grid: headers, cells, selection overlays and mouse gestures.

import { useCallback, useRef, type RefObject } from 'react';
import { indexToCol, type Area, type CellAddr } from '../engine/address.ts';
import {
  clickCell,
  clickCol,
  clickCorner,
  clickRow,
  drag as dragGesture,
  type DragEnd,
  type Selection,
} from '../engine/selection.ts';
import type { CellView } from '../engine/workbook.ts';

export const GEO = {
  rowHeaderW: 46,
  colHeaderH: 24,
  cellW: 80,
  cellH: 22,
  cols: 30,
  rows: 60,
};

interface GridProps {
  cells: Map<string, CellView>;
  sel: Selection;
  setSel: (sel: Selection) => void;
  editing: boolean;
  editorRef: RefObject<HTMLDivElement | null>;
  onEditorKeyDown: (e: React.KeyboardEvent) => void;
  onEditorInput: () => void;
  onCommitAway: () => void;
  startEdit: (text: string) => void;
  focusEditor: () => void;
}

type Target =
  | { kind: 'corner' }
  | { kind: 'col'; col: number }
  | { kind: 'row'; row: number }
  | { kind: 'cell'; cell: CellAddr };

interface DragState {
  target: Target;
  hold: { shift: boolean; cmd: boolean };
  preSel: Selection;
  moved: boolean;
}

const dragEndOf = (t: Target): DragEnd | null => {
  if (t.kind === 'col') return { type: 'col', col: t.col };
  if (t.kind === 'row') return { type: 'row', row: t.row };
  if (t.kind === 'cell') return { type: 'cell', cell: t.cell };
  return null;
};

/** The visible part of an area, as CSS geometry. */
const overlayStyle = (area: Area): React.CSSProperties | null => {
  const c2 = Math.min(area.c2, GEO.cols);
  const r2 = Math.min(area.r2, GEO.rows);
  if (area.c1 > c2 || area.r1 > r2) return null;
  return {
    left: GEO.rowHeaderW + (area.c1 - 1) * GEO.cellW,
    top: GEO.colHeaderH + (area.r1 - 1) * GEO.cellH,
    width: (c2 - area.c1 + 1) * GEO.cellW,
    height: (r2 - area.r1 + 1) * GEO.cellH,
  };
};

export const Grid = (props: GridProps) => {
  const { cells, sel, setSel, editing, editorRef } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const locate = useCallback((clientX: number, clientY: number): Target | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    const y = clientY - rect.top + el.scrollTop;
    if (x < 0 || y < 0) return null;
    const inColHeader = y < GEO.colHeaderH;
    const inRowHeader = x < GEO.rowHeaderW;
    const col = Math.floor((x - GEO.rowHeaderW) / GEO.cellW) + 1;
    const row = Math.floor((y - GEO.colHeaderH) / GEO.cellH) + 1;
    if (inColHeader && inRowHeader) return { kind: 'corner' };
    if (inColHeader) return col >= 1 && col <= GEO.cols ? { kind: 'col', col } : null;
    if (inRowHeader) return row >= 1 && row <= GEO.rows ? { kind: 'row', row } : null;
    if (col < 1 || col > GEO.cols || row < 1 || row > GEO.rows) return null;
    return { kind: 'cell', cell: { col, row } };
  }, []);

  const applyDrag = useCallback(
    (state: DragState, to: Target) => {
      const from = dragEndOf(state.target);
      const end = dragEndOf(to);
      if (!from || !end) return;
      setSel(dragGesture(state.preSel, from, end, state.hold));
    },
    [setSel],
  );

  const onMove = useCallback(
    (e: MouseEvent) => {
      const state = dragRef.current;
      const to = locate(e.clientX, e.clientY);
      if (!state || !to) return;
      state.moved = true;
      applyDrag(state, to);
    },
    [applyDrag, locate],
  );

  const onUp = useCallback(
    (e: MouseEvent) => {
      const state = dragRef.current;
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!state || state.moved || !state.hold.cmd) return;
      const target = locate(e.clientX, e.clientY);
      if (!target) return;
      if (target.kind === 'cell') setSel(clickCell(state.preSel, target.cell, state.hold));
      else if (target.kind === 'col') setSel(clickCol(state.preSel, target.col, state.hold));
      else if (target.kind === 'row') setSel(clickRow(state.preSel, target.row, state.hold));
    },
    [locate, onMove, setSel],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const target = locate(e.clientX, e.clientY);
      if (!target) return;
      e.preventDefault();
      props.focusEditor();
      const hold = { shift: e.shiftKey, cmd: e.metaKey || e.ctrlKey };
      if (e.detail === 2 && target.kind === 'cell') {
        props.startEdit(cells.get(`${indexToCol(target.cell.col)}${target.cell.row}`)?.raw ?? '');
        return;
      }
      if (editing) props.onCommitAway();
      if (target.kind === 'corner') {
        setSel(clickCorner());
        return;
      }
      dragRef.current = { target, hold, preSel: sel, moved: false };
      if (!hold.cmd) {
        if (target.kind === 'cell') setSel(clickCell(sel, target.cell, hold));
        else if (target.kind === 'col') setSel(clickCol(sel, target.col, hold));
        else setSel(clickRow(sel, target.row, hold));
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [locate, sel, setSel, cells, editing, onMove, onUp, props],
  );

  const headers: React.ReactNode[] = [];
  for (let c = 1; c <= GEO.cols; c += 1) {
    headers.push(
      <div key={`h${c}`} className={`col-header${colSelected(sel, c) ? ' selected' : ''}`}>
        {indexToCol(c)}
      </div>,
    );
  }
  const body: React.ReactNode[] = [];
  for (let r = 1; r <= GEO.rows; r += 1) {
    const rowCells: React.ReactNode[] = [
      <div key={`r${r}`} className={`row-header${rowSelected(sel, r) ? ' selected' : ''}`}>
        {r}
      </div>,
    ];
    for (let c = 1; c <= GEO.cols; c += 1) {
      const view = cells.get(`${indexToCol(c)}${r}`);
      rowCells.push(
        <div key={`c${c}`} className={`cell align-${view?.align ?? 'left'}`}>
          {view?.display ?? ''}
        </div>,
      );
    }
    body.push(
      <div key={`row${r}`} className="row">
        {rowCells}
      </div>,
    );
  }

  const activeStyle = overlayStyle({
    c1: sel.active.col,
    r1: sel.active.row,
    c2: sel.active.col,
    r2: sel.active.row,
  });

  return (
    <div id="grid" className="grid" ref={containerRef} onMouseDown={onMouseDown}>
      <div className="grid-inner" style={{ width: GEO.rowHeaderW + GEO.cols * GEO.cellW }}>
        <div className="header-row">
          <div className="corner" />
          {headers}
        </div>
        {body}
        {sel.areas.map((area, i) => {
          const style = overlayStyle(area);
          return style ? (
            <div key={`area${i}`} className={i === sel.areas.length - 1 ? 'area-active' : 'area-other'} style={style} />
          ) : null;
        })}
        {activeStyle ? <div className="active-cell" style={activeStyle} /> : null}
        {activeStyle ? (
          <div
            id="cell-editor"
            className="cell-editor"
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            tabIndex={0}
            onKeyDown={props.onEditorKeyDown}
            onInput={props.onEditorInput}
            style={activeStyle}
          />
        ) : null}
      </div>
    </div>
  );
};

const colSelected = (sel: Selection, col: number): boolean =>
  sel.areas.some((a) => col >= a.c1 && col <= a.c2);

const rowSelected = (sel: Selection, row: number): boolean =>
  sel.areas.some((a) => row >= a.r1 && row <= a.r2);
