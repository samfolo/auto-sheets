import type { Frame, Page } from 'playwright';

/**
 * Where a spreadsheet's controls are. Excel for the web exposes these for screen readers, and
 * a clone must expose the same four, so one driver works on both.
 */
export interface SheetSelectors {
  /** Shows the active cell's address; typing an address and pressing Enter selects it. */
  readonly nameBox: string;
  /** Shows the active cell's raw content. */
  readonly formulaBar: string;
  /** Receives keystrokes aimed at the grid, and holds the text while a cell is edited. */
  readonly cellEditor: string;
  /** Its aria-label describes the selection for screen readers. See readout.ts. */
  readonly readout: string;
}

/** How long to wait for a sheet, and how many times to repeat what is safe to repeat. */
export interface SheetTiming {
  /** A single action taking effect, such as the selection moving. */
  readonly actionMs: number;
  /** How often to check whether an action has taken effect. */
  readonly pollMs: number;
  /** A pause after a shortcut that gives no signal when it finishes, such as undo. */
  readonly settleMs: number;
  /** Tries at selecting through the Name Box; selecting changes nothing, so it's safe to repeat. */
  readonly selectTries: number;
  /** Tries at typing text before committing it; each try after the first follows Escape. */
  readonly typingTries: number;
  /** Tries at an entry that provably didn't commit. */
  readonly commitTries: number;
}

/** An open sheet: its tab, the frame holding its controls, where they are, and its pace. */
export interface Surface {
  readonly page: Page;
  readonly frame: Frame;
  readonly selectors: SheetSelectors;
  readonly timing: SheetTiming;
}
