/**
 * Turning a key press into one action for the sheet. Keeping this out of the component makes
 * the keyboard map readable and easy to extend.
 */

/** One thing a key press asks the sheet to do. */
export type KeyAction =
  | { kind: 'run'; type: string }
  | { kind: 'commit'; ctrl: boolean; move: 'down' | 'right' | 'none' }
  | { kind: 'clear' }
  | { kind: 'press'; key: string; hold: string[] }
  | { kind: 'edit'; text: string }
  | { kind: 'erase' }
  | { kind: 'cancel' };

/** The parts of a keyboard event the sheet cares about. */
export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Command keys that run a named action. */
const COMMANDS: Record<string, string> = {
  z: 'undo',
  y: 'redo',
  c: 'copy',
  v: 'paste',
  d: 'fill-down',
  a: 'select-all',
};

/** Keys the sheet treats as movement. */
const MOVE_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

const holdOf = (event: KeyEventLike): string[] => {
  const hold: string[] = [];
  if (event.shiftKey) hold.push('Shift');
  if (event.metaKey || event.ctrlKey) hold.push('Command');
  return hold;
};

/** A Command shortcut, or a commit from Ctrl+Enter. */
const resolveCommand = (event: KeyEventLike, key: string): KeyAction | null => {
  if (!event.metaKey && !event.ctrlKey) return null;
  const command = COMMANDS[key.toLowerCase()];
  if (command) return { kind: 'run', type: command };
  return key === 'Enter' ? { kind: 'commit', ctrl: true, move: 'none' } : null;
};

/** The keys with one fixed effect; undefined when the key is not one of them. */
const resolveSpecial = (
  event: KeyEventLike,
  key: string,
  editing: boolean,
): KeyAction | undefined => {
  if (key === 'Enter') {
    return editing
      ? { kind: 'commit', ctrl: false, move: 'down' }
      : { kind: 'press', key, hold: holdOf(event) };
  }
  if (key === 'Escape') return { kind: 'cancel' };
  if (key === 'Tab') {
    return editing
      ? { kind: 'commit', ctrl: false, move: 'right' }
      : { kind: 'press', key, hold: holdOf(event) };
  }
  if (key === 'Delete') return { kind: 'clear' };
  if (key === 'Backspace') return editing ? { kind: 'erase' } : { kind: 'clear' };
  return undefined;
};

/** The action a key press asks for, or null when the sheet ignores it. */
export const resolveKey = (event: KeyEventLike, editing: boolean): KeyAction | null => {
  const key = event.key;
  const command = resolveCommand(event, key);
  if (command) return command;
  if (event.metaKey || event.ctrlKey) return null;
  const special = resolveSpecial(event, key, editing);
  if (special !== undefined) return special;
  if (MOVE_KEYS.has(key)) return editing ? null : { kind: 'press', key, hold: holdOf(event) };
  if (key.length === 1 && !event.altKey) return { kind: 'edit', text: key };
  return null;
};
