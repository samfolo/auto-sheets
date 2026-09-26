/**
 * The workbook session: cells, the selection and the undo history together, with one method
 * per action a person can take. The screen calls these through the API and renders the state.
 */
import { formatCellRect, formatRect, isSingleCell, parseRect } from './address.js';
import {
  buildClipboard,
  changesForClear,
  changesForFillDown,
  changesForPaste,
  changesForSet,
  changesForTextInto,
  type Clipboard,
} from './content.js';
import type { CellChange } from './history.js';
import { History } from './history.js';
import {
  applyClick,
  applyColumnClick,
  applyCorner,
  applyDrag,
  applyExtend,
  applyMove,
  applyMoveWithin,
  applyRowClick,
  applySelectAll,
  type Endpoint,
} from './gestures.js';
import { readout, singleSelection, type SelectionState } from './selection.js';
import { Sheet, type CellView } from './sheet.js';

/** What the screen needs to draw itself after any action. */
export interface SessionState {
  cells: { address: string; raw: string; display: string; annotations: string[] }[];
  selection: { areas: string[]; active: string; range: string | null };
  nameBox: string;
  readout: string;
  version: number;
}

/** Keys the sheet understands as movement. */
export type MoveKey =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Tab'
  | 'Enter'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown';

export class Session {
  readonly sheet = new Sheet();
  selection: SelectionState = singleSelection(0, 0);
  clipboard: Clipboard | null = null;
  private version = 0;
  private readonly history = new History();

  /** Replace the workbook with a blank one. */
  reset(): void {
    for (const { col, row } of this.sheet.entries()) this.sheet.clear(col, row);
    this.selection = singleSelection(0, 0);
    this.clipboard = null;
    this.history.reset();
    this.version += 1;
  }

  /** The state the screen renders. */
  state(): SessionState {
    const areas = this.selection.areas.map(formatRect);
    const single =
      this.selection.areas.length === 1 &&
      this.selection.areas[0] &&
      !isSingleCell(this.selection.areas[0])
        ? formatRect(this.selection.areas[0])
        : null;
    return {
      cells: this.sheet.entries().map(({ address, view }) => ({ address, ...view })),
      selection: { areas, active: this.activeAddress(), range: single },
      nameBox: this.activeAddress(),
      readout: readout(this.selection, this.sheet, false),
      version: this.version,
    };
  }

  /** The active cell's address. */
  private activeAddress(): string {
    return formatCellRect({
      c1: this.selection.active.col,
      r1: this.selection.active.row,
      c2: this.selection.active.col,
      r2: this.selection.active.row,
    });
  }

  /** The view of one cell, for a checkpoint. */
  cellView(col: number, row: number): CellView {
    return this.sheet.view(col, row);
  }

  private apply(changes: CellChange[]): void {
    this.history.record(changes);
    for (const change of changes) this.sheet.set(change.col, change.row, change.after);
  }

  /** Select a cell or range typed into the Name Box. */
  selectRange(text: string): void {
    const rect = parseRect(text);
    this.selection = {
      areas: [rect],
      active: { col: rect.c1, row: rect.r1 },
      anchor: { col: rect.c1, row: rect.r1 },
      focus: { col: rect.c1, row: rect.r1 },
    };
  }

  /** Type text into the active cell and move, or into the whole selection. */
  commit(text: string, ctrl: boolean, move: 'down' | 'right' | 'none' = 'down'): void {
    if (ctrl) {
      this.apply(changesForTextInto(this.sheet, this.selection.areas, text));
      return;
    }
    const { col, row } = this.selection.active;
    this.apply(changesForSet(this.sheet, col, row, text));
    if (move === 'down') this.enterMove();
    else if (move === 'right') this.selection = applyMove(this.selection, 1, 0);
  }

  /** What Enter does after a commit: move down, staying inside a selected range. */
  private enterMove(): void {
    if (this.selection.areas.length === 1) {
      const area = this.selection.areas[0]!;
      if (!isSingleCell(area)) {
        const nextRow = this.selection.active.row + 1;
        if (nextRow <= area.r2) {
          this.selection = {
            ...this.selection,
            active: { col: this.selection.active.col, row: nextRow },
          };
        } else if (this.selection.active.col < area.c2) {
          this.selection = {
            ...this.selection,
            active: { col: this.selection.active.col + 1, row: area.r1 },
          };
        }
        return;
      }
    }
    this.selection = applyMove(this.selection, 0, 1);
  }

  /** Delete the contents of the selection. */
  clear(): void {
    this.apply(changesForClear(this.sheet, this.selection.areas));
  }

  /** Fill each column of the selection down from its top row. */
  fillDown(): void {
    this.apply(changesForFillDown(this.sheet, this.selection.areas));
  }

  /** Remember the first selected area. */
  copy(): void {
    const area = this.selection.areas[0];
    if (area) this.clipboard = buildClipboard(this.sheet, area);
  }

  /** Paste the copied block at the active cell. */
  paste(): void {
    if (!this.clipboard) return;
    this.apply(changesForPaste(this.sheet, this.clipboard, this.selection.active));
  }

  undo(): void {
    this.history.undo(this.sheet);
  }

  redo(): void {
    this.history.redo(this.sheet);
  }

  click(col: number, row: number, hold: string[]): void {
    this.selection = applyClick(this.selection, col, row, hold);
  }

  drag(from: Endpoint, to: Endpoint, hold: string[]): void {
    this.selection = applyDrag(this.selection, from, to, hold);
  }

  clickColumn(col: number, hold: string[]): void {
    this.selection = applyColumnClick(this.selection, col, hold);
  }

  clickRow(row: number, hold: string[]): void {
    this.selection = applyRowClick(this.selection, row, hold);
  }

  clickCorner(): void {
    this.selection = applyCorner();
  }

  selectAll(): void {
    this.selection = applySelectAll(this.selection);
  }

  /** Handle the keys that move by more than one step; true when one applied. */
  private specialPress(key: MoveKey, hold: string[]): boolean {
    if (key === 'Home') {
      this.moveBy(-this.selection.active.col, 0);
      return true;
    }
    if (key === 'End' || key === 'PageUp' || key === 'PageDown') {
      this.moveBy(0, key === 'PageUp' ? -28 : key === 'PageDown' ? 28 : 0);
      return true;
    }
    if (hold.includes('Shift') && key === 'Tab') {
      this.selection = applyMoveWithin(this.selection, -1, 0);
      return true;
    }
    return false;
  }

  /** Apply a movement key, with Shift extending or moving within the selection. */
  press(key: MoveKey, hold: string[]): void {
    if (this.specialPress(key, hold)) return;
    const shift = hold.includes('Shift');
    const [dCol, dRow] = (shift ? SHIFT_STEPS : STEPS)[key] ?? [0, 0];
    if (shift) {
      this.selection = applyExtend(this.selection, dCol, dRow);
      return;
    }
    const area = this.selection.areas[0];
    if ((key === 'Tab' || key === 'Enter') && area && !isSingleCell(area)) {
      this.selection = applyMoveWithin(this.selection, dCol, dRow);
      return;
    }
    this.moveBy(dCol, dRow);
  }

  /** Move the active cell and collapse the selection to it. */
  private moveBy(dCol: number, dRow: number): void {
    this.selection = applyMove(this.selection, dCol, dRow);
  }
}

/** How each movement key moves the active cell. */
const STEPS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  Tab: [1, 0],
  Enter: [0, 1],
};

/** How each key moves the focus corner while Shift is held. */
const SHIFT_STEPS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  Enter: [0, -1],
};
