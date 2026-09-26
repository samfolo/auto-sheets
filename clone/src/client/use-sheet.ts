/**
 * The screen's controller: it owns the editing state and turns key presses and grid gestures
 * into API calls. The App component only lays out what this returns.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { resolveKey } from './keyboard';
import { useSession } from './use-session';

/** Everything the App needs to draw the sheet and react to a person. */
export interface SheetController {
  nameBox: string;
  formulaBar: string;
  readout: string;
  state: ReturnType<typeof useSession>['state'];
  editing: boolean;
  editorText: string;
  editorRef: RefObject<HTMLDivElement | null>;
  select: (address: string) => void;
  onKeyDown: (event: globalThis.KeyboardEvent) => void;
  onInput: (text: string) => void;
  onEditStart: (raw: string) => void;
  onGesture: () => void;
  run: (type: string, body?: Record<string, unknown>) => Promise<void>;
}

/** Build the controller for the sheet screen. */
export const useSheet = (): SheetController => {
  const { state, call } = useSession();
  const [editing, setEditing] = useState(false);
  const [editorText, setEditorText] = useState('');
  const editorRef = useRef<HTMLDivElement | null>(null);

  const run = useCallback(
    async (type: string, body: Record<string, unknown> = {}) => {
      await call(type, body);
      editorRef.current?.focus();
    },
    [call],
  );

  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  const commit = useCallback(
    (text: string, ctrl: boolean, move: 'down' | 'right' | 'none') => {
      setEditing(false);
      setEditorText('');
      void run('commit', { text, ctrl, move });
    },
    [run],
  );

  const onKeyDown = (event: globalThis.KeyboardEvent): void => {
    const action = resolveKey(event, editing);
    if (!action) return;
    event.preventDefault();
    if (action.kind === 'run') void run(action.type);
    else if (action.kind === 'commit') commit(editorText, action.ctrl, action.move);
    else if (action.kind === 'clear') void run('clear');
    else if (action.kind === 'press') void run('press', { key: action.key, hold: action.hold });
    else if (action.kind === 'erase') setEditorText((text) => text.slice(0, -1));
    else if (action.kind === 'cancel') {
      setEditing(false);
      setEditorText('');
    } else {
      setEditorText((text) => (editing ? text + action.text : action.text));
      setEditing(true);
    }
  };

  const activeRaw = state?.cells.find((cell) => cell.address === state.nameBox)?.raw ?? '';

  return {
    nameBox: state?.nameBox ?? '',
    formulaBar: editing ? editorText : activeRaw,
    readout: editing ? 'Editing' : (state?.readout ?? ''),
    state,
    editing,
    editorText,
    editorRef,
    select: (address) => void run('select', { address }),
    onKeyDown,
    onInput: (text) => {
      setEditorText(text);
      if (text !== '') setEditing(true);
    },
    onEditStart: (raw) => {
      setEditorText(raw);
      setEditing(true);
      editorRef.current?.focus();
    },
    onGesture: () => {
      setEditing(false);
      setEditorText('');
    },
    run,
  };
};
