import type { CellAddress } from '../contracts/case.ts';
import type { CellObservation } from '../contracts/reference.ts';
import type { Result } from '../core/result.ts';

/**
 * What the factory needs from any system it runs cases on: Excel, or a clone. Each method is
 * one thing a person does, or one look at the sheet, so the same case runs on either.
 */
export interface Driver {
  /** The system being driven, as named in reports. */
  readonly target: string;
  /** Describes the system and its regional format, for reference.json. */
  readonly environment: string;
  /** Opens a new blank sheet. Every case starts here. */
  readonly openBlank: () => Promise<Result<void>>;
  /** Selects the cell, types the text (replacing what was there) and presses Enter. */
  readonly enter: (cell: CellAddress, text: string) => Promise<Result<void>>;
  readonly undo: () => Promise<Result<void>>;
  readonly redo: () => Promise<Result<void>>;
  /** Selects the cell and reads what the formula bar and the cell show. */
  readonly observe: (cell: CellAddress) => Promise<Result<CellObservation>>;
}
