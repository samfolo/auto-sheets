// The screen's state: server cell data plus the selection and editing model.

import { useCallback, useEffect, useRef, useState } from 'react';
import { areaContains, cellName, type Area, type CellAddr } from '../engine/address.ts';
import { initialSelection, type Selection } from '../engine/selection.ts';
import type { CellView } from '../engine/workbook.ts';
import { fetchState, postChange, type StateBody } from './api.ts';

export interface AppState {
  cells: Map<string, CellView>;
  sel: Selection;
  editing: boolean;
  editText: string;
}

/** Every cell address covered by the selection's areas (capped for huge areas). */
export const selectedAddrs = (sel: Selection): string[] => {
  const out: string[] = [];
  const CAP = 200000;
  for (const area of sel.areas) {
    for (let r = area.r1; r <= area.r2 && out.length < CAP; r += 1)
      for (let c = area.c1; c <= area.c2 && out.length < CAP; c += 1)
        out.push(cellName({ col: c, row: r }));
  }
  return out;
};

/** The selection area the active cell belongs to. */
export const activeArea = (sel: Selection): Area =>
  sel.areas.find((a) => areaContains(a, sel.active)) ?? (sel.areas[sel.areas.length - 1] as Area);

export const addrName = (cell: CellAddr): string => cellName(cell);

/** Holds the screen state and applies server responses. */
export const useAppState = () => {
  const [cells, setCells] = useState<Map<string, CellView>>(new Map());
  const [sel, setSel] = useState<Selection>(initialSelection);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const serverMark = useRef({ version: -1, revision: -1 });
  const selRef = useRef(sel);
  selRef.current = sel;
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const applyState = useCallback((body: StateBody) => {
    const isReset = body.version !== serverMark.current.version;
    serverMark.current = { version: body.version, revision: body.revision };
    setCells(new Map(body.cells.map((c) => [c.addr, c])));
    if (isReset) {
      setSel(initialSelection());
      setEditing(false);
      setEditText('');
    }
  }, []);

  useEffect(() => {
    fetchState().then(applyState).catch(() => undefined);
    const timer = setInterval(() => {
      fetchState()
        .then((body) => {
          if (body.version !== serverMark.current.version) applyState(body);
          else if (body.revision !== serverMark.current.revision) applyState(body);
        })
        .catch(() => undefined);
    }, 600);
    return () => clearInterval(timer);
  }, [applyState]);

  /** Send a content change to the server and apply the returned state. */
  const change = useCallback(
    (path: string, body?: unknown) => {
      postChange(path, body).then(applyState).catch(() => undefined);
    },
    [applyState],
  );

  return {
    cells,
    sel,
    setSel,
    editing,
    setEditing,
    editText,
    setEditText,
    selRef,
    editingRef,
    change,
  };
};
