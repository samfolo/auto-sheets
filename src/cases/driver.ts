import type { ActionStep, CellAddress } from '../contracts/case.ts';
import type { CellObservation } from '../contracts/reference.ts';
import type { Result } from '../core/result.ts';

/**
 * What the factory needs from any system it runs cases on: Excel, or a clone. Steps are
 * performed one at a time, and observing a cell is the one step that reads, so the same case
 * runs on either system.
 */
export interface Driver {
  /** The system being driven, as named in reports. */
  readonly target: string;
  /** Describes the system and its regional format, for reference.json. */
  readonly environment: string;
  /** Opens a new sheet: blank, or from a seed workbook on disk. Every case starts here. */
  readonly open: (seed: string | null) => Promise<Result<void>>;
  /** Does one thing a person does, such as entering text or pressing undo. */
  readonly perform: (step: ActionStep) => Promise<Result<void>>;
  /** Selects the cell and reads what the formula bar and the cell show. */
  readonly observe: (cell: CellAddress) => Promise<Result<CellObservation>>;
}
