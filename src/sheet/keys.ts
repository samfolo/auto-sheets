/**
 * The keys steps press. Playwright's ControlOrMeta is Cmd on a Mac and Ctrl elsewhere, which
 * matches Excel's shortcuts, except that filling a selection is Ctrl+Enter on every platform
 * (observed in Excel for the web on a Mac, 26 September 2026).
 */
export const KEYS = {
  commit: 'Enter',
  cancel: 'Escape',
  selectAllText: 'ControlOrMeta+A',
  enterInSelection: 'Control+Enter',
  clear: 'Delete',
  fillDown: 'ControlOrMeta+D',
  copy: 'ControlOrMeta+C',
  paste: 'ControlOrMeta+V',
  undo: 'ControlOrMeta+Z',
  redo: 'ControlOrMeta+Y',
} as const;
