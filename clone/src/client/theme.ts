/**
 * Shared measurements and colours for the grid and its controls, so the look lives in one
 * place. The cell size is fixed so every cell in a new sheet is evenly sized.
 */
export const COL_WIDTH = 72;
export const ROW_HEIGHT = 24;
export const HEADER_WIDTH = 48;
export const HEADER_HEIGHT = 24;

/** How much of the sheet the grid draws. */
export const VISIBLE_ROWS = 40;
export const VISIBLE_COLS = 20;

export const COLORS = {
  gridLine: '#d4d4d4',
  headerBackground: '#f5f5f5',
  headerSelected: '#cfe3cf',
  selectedCell: 'rgba(33, 115, 70, 0.08)',
  selectionBorder: '#217346',
  activeBorder: '#217346',
  editBorder: '#e0b400',
  errorText: '#c00000',
  headerText: '#444444',
  cellText: '#1f1f1f',
};
