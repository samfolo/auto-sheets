// The screen: grid, Name Box, formula bar, cell editor and readout.

import { useCallback, useRef } from 'react';
import { areaName, parseArea } from '../engine/address.ts';
import { nameBoxText, readoutText } from '../engine/readout.ts';
import { keyMove } from '../engine/movement.ts';
import { selectAll, selectArea } from '../engine/selection.ts';
import { activeArea, addrName, selectedAddrs, useAppState } from './app-state.ts';
import { Grid } from './grid.tsx';
import { useState } from 'react';

const editorText = (el: HTMLDivElement | null): string =>
  (el?.textContent ?? '').replaceAll(' ', ' ').replace(/\n$/, '');

export const App = () => {
  const state = useAppState();
  const { cells, sel, setSel, editing, setEditing, editText, setEditText, selRef, editingRef, change } = state;
  const editorRef = useRef<HTMLDivElement>(null);
  const [nameFocused, setNameFocused] = useState(false);
  const [nameText, setNameText] = useState('');

  const focusEditor = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const clearEditor = useCallback(() => {
    if (editorRef.current) editorRef.current.textContent = '';
    setEditText('');
  }, [setEditText]);

  const startEdit = useCallback(
    (text: string) => {
      setEditing(true);
      setEditText(text);
      const el = editorRef.current;
      if (el) {
        el.textContent = text;
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    },
    [setEditing, setEditText],
  );

  const cancelEdit = useCallback(() => {
    setEditing(false);
    clearEditor();
    focusEditor();
  }, [setEditing, clearEditor, focusEditor]);

  /** Commit the editor's text into the active cell, then move like Excel does. */
  const commitEdit = useCallback(
    (key: string, shift: boolean) => {
      const text = editorText(editorRef.current);
      const current = selRef.current;
      if (editingRef.current && text !== '') {
        change('/api/entry', { addr: addrName(current.active), text });
      }
      setEditing(false);
      clearEditor();
      setSel(keyMove(current, key, shift));
      focusEditor();
    },
    [change, clearEditor, focusEditor, selRef, setSel, setEditing, editingRef],
  );

  /** Commit the editor's text without moving the selection (clicking away). */
  const commitAway = useCallback(() => {
    const text = editorText(editorRef.current);
    if (editingRef.current && text !== '') {
      change('/api/entry', { addr: addrName(selRef.current.active), text });
    }
    setEditing(false);
    clearEditor();
  }, [change, clearEditor, editingRef, selRef, setEditing]);

  /** Ctrl+Enter: commit the typed text into every selected cell as one change. */
  const commitAll = useCallback(() => {
    const text = editorText(editorRef.current);
    if (editingRef.current && text !== '') {
      change('/api/entry-many', { addrs: selectedAddrs(selRef.current), text });
    }
    setEditing(false);
    clearEditor();
    focusEditor();
  }, [change, clearEditor, focusEditor, selRef, setEditing, editingRef]);

  const onEditorInput = useCallback(() => {
    const text = editorText(editorRef.current);
    if (!editingRef.current) setEditing(true);
    setEditText(text);
  }, [editingRef, setEditing, setEditText]);

  const onEditorKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (editingRef.current) {
        if (e.key === 'Enter' && mod) {
          e.preventDefault();
          commitAll();
        } else if (e.key === 'Enter' || e.key === 'Tab' || e.key.startsWith('Arrow')) {
          e.preventDefault();
          commitEdit(e.key, e.shiftKey);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
        }
        return;
      }
      if (mod) {
        onModKey(e);
        return;
      }
      switch (e.key) {
        case 'Enter':
        case 'Tab':
        case 'Home':
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          e.preventDefault();
          setSel(keyMove(selRef.current, e.key, e.shiftKey));
          break;
        case 'Delete':
          e.preventDefault();
          change('/api/clear', { addrs: selectedAddrs(selRef.current) });
          break;
        case 'Backspace':
          e.preventDefault();
          change('/api/clear', { addrs: selectedAddrs(selRef.current) });
          setEditing(true);
          break;
        case 'F2':
          e.preventDefault();
          startEdit(cells.get(addrName(selRef.current.active))?.raw ?? '');
          break;
        default:
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cells, change, commitAll, commitEdit, cancelEdit, setSel, selRef, startEdit, setEditing],
  );

  const onModKey = (e: React.KeyboardEvent): void => {
    const current = selRef.current;
    switch (e.key.toLowerCase()) {
      case 'z':
        e.preventDefault();
        change('/api/undo');
        break;
      case 'y':
        e.preventDefault();
        change('/api/redo');
        break;
      case 'c':
        e.preventDefault();
        change('/api/copy', { area: areaName(activeArea(current)) });
        break;
      case 'v':
        e.preventDefault();
        change('/api/paste', { at: addrName(current.active) });
        break;
      case 'd':
        e.preventDefault();
        change('/api/fill-down', { area: areaName(activeArea(current)) });
        break;
      case 'a':
        e.preventDefault();
        setSel(selectAll(current));
        break;
      default:
        break;
    }
  };

  const onNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const area = parseArea(e.currentTarget.value);
        if (area) setSel(selectArea(area));
        e.currentTarget.blur();
        focusEditor();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.currentTarget.blur();
        focusEditor();
      }
    },
    [setSel, focusEditor],
  );

  const activeView = cells.get(addrName(sel.active));
  const readout = readoutText(
    { ...sel, editing },
    { display: activeView?.display ?? '', annotations: activeView?.annotations ?? [] },
  );

  return (
    <div className="sheet-app">
      <div className="bar">
        <input
          id="name-box"
          aria-label="Name Box"
          className="name-box"
          value={nameFocused ? nameText : nameBoxText(sel)}
          onFocus={(e) => {
            setNameFocused(true);
            setNameText(e.currentTarget.value);
          }}
          onBlur={() => setNameFocused(false)}
          onChange={(e) => setNameText(e.currentTarget.value)}
          onKeyDown={onNameKeyDown}
        />
        <div id="formula-bar" className="formula-bar">
          {editing ? editText : (activeView?.raw ?? '')}
        </div>
      </div>
      <Grid
        cells={cells}
        sel={sel}
        setSel={setSel}
        editing={editing}
        editorRef={editorRef}
        onEditorKeyDown={onEditorKeyDown}
        onEditorInput={onEditorInput}
        onCommitAway={commitAway}
        startEdit={startEdit}
        focusEditor={focusEditor}
      />
      <div id="readout" className="readout" aria-label={readout} />
    </div>
  );
};
