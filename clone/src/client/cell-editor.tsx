/**
 * The cell editor: the focusable element that receives keystrokes aimed at the grid. While a
 * cell is being edited its text is exactly what has been typed so far.
 */
import * as React from 'react';
import { useEffect, type JSX, type RefObject } from 'react';
import styles from './cell-editor.module.css';

/** Props for the editor, which owns no state of its own. */
export interface CellEditorProps {
  editing: boolean;
  text: string;
  inputRef: RefObject<HTMLDivElement | null>;
  onKeyDown: (event: globalThis.KeyboardEvent) => void;
  onInput: (text: string) => void;
}

/** The element the checker types into; it is always focused. */
export const CellEditor = ({
  editing,
  text,
  inputRef,
  onKeyDown,
  onInput,
}: CellEditorProps): JSX.Element => {
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return undefined;
    const key = (event: globalThis.KeyboardEvent): void => onKeyDown(event);
    const input = (): void => onInput(element.textContent ?? '');
    element.addEventListener('keydown', key);
    element.addEventListener('input', input);
    return () => {
      element.removeEventListener('keydown', key);
      element.removeEventListener('input', input);
    };
  }, [inputRef, onKeyDown, onInput]);

  return (
    <div
      id="cell-editor"
      ref={inputRef}
      className={editing ? styles.editorEditing : styles.editor}
      contentEditable
      suppressContentEditableWarning
      aria-label="Cell editor"
    >
      {editing ? text : ''}
    </div>
  );
};
