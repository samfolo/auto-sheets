/**
 * The undo history: each change is a list of cells with the content before and after, so one
 * action (an entry, a clear over a range, a fill, a paste) is one undo step.
 */
import type { Cell } from './entry.js';
import type { Sheet } from './sheet.js';

/** One cell's content before and after a change. */
export interface CellChange {
  col: number;
  row: number;
  before: Cell;
  after: Cell;
}

/** A shallow copy of a cell, so later edits never mutate a history record. */
export const copyCell = (cell: Cell): Cell => ({ ...cell });

/** Undo/redo stacks of whole actions. */
export class History {
  private readonly undoStack: CellChange[][] = [];
  private readonly redoStack: CellChange[][] = [];

  /** Clear both stacks, as a new workbook does. */
  reset(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  /** Record one action, which also drops anything that had been undone. */
  record(changes: CellChange[]): void {
    if (changes.length === 0) return;
    this.undoStack.push(changes);
    this.redoStack.length = 0;
  }

  /** Undo the last action, returning the cells it touched. */
  undo(sheet: Sheet): CellChange[] {
    const changes = this.undoStack.pop();
    if (!changes) return [];
    for (const change of changes) sheet.set(change.col, change.row, copyCell(change.before));
    this.redoStack.push(changes);
    return changes;
  }

  /** Redo the last undone action. */
  redo(sheet: Sheet): CellChange[] {
    const changes = this.redoStack.pop();
    if (!changes) return [];
    for (const change of changes) sheet.set(change.col, change.row, copyCell(change.after));
    this.undoStack.push(changes);
    return changes;
  }
}
