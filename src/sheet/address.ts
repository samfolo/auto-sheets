import type { CellAddress } from '../contracts/case.ts';

/** Column letters and row number of a validated A1 address. */
const PARTS = /^([A-Z]+)(\d+)$/;

/** The cell directly below, which is where Enter moves the selection after an entry. */
export const cellBelow = (address: CellAddress): CellAddress => {
  const [, column = '', row = '0'] = PARTS.exec(address) ?? [];
  return `${column}${Number(row) + 1}`;
};
