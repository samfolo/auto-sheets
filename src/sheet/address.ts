import type { CellAddress, RangeAddress } from './contract.ts';

/** Column letters and row number of a validated A1 address. */
const PARTS = /^([A-Z]+)(\d+)$/;
const LETTERS = 26;
const CHAR_CODE_BEFORE_A = 64;

interface Position {
  readonly column: number;
  readonly row: number;
}

const columnNumber = (letters: string): number =>
  Array.from(letters).reduce(
    (number, letter) => number * LETTERS + letter.charCodeAt(0) - CHAR_CODE_BEFORE_A,
    0,
  );

const columnLetters = (column: number): string =>
  column <= 0
    ? ''
    : columnLetters(Math.floor((column - 1) / LETTERS)) +
      String.fromCharCode(CHAR_CODE_BEFORE_A + 1 + ((column - 1) % LETTERS));

const positionOf = (address: CellAddress): Position => {
  const [, letters = '', row = '0'] = PARTS.exec(address) ?? [];
  return { column: columnNumber(letters), row: Number(row) };
};

const addressOf = ({ column, row }: Position): CellAddress => `${columnLetters(column)}${row}`;

/** The cell directly below, which is where Enter moves the selection after an entry. */
export const cellBelow = (address: CellAddress): CellAddress => {
  const { column, row } = positionOf(address);
  return addressOf({ column, row: row + 1 });
};

/** The whole numbers between two ends, inclusive, in increasing order. */
const span = (from: number, to: number): number[] =>
  Array.from({ length: Math.abs(to - from) + 1 }, (_, offset) => Math.min(from, to) + offset);

/** Every cell in a range, row by row, whichever corners the range is written with. */
export const cellsIn = (range: RangeAddress): CellAddress[] => {
  const [first = '', second = first] = range.split(':');
  const [start, end] = [positionOf(first), positionOf(second)];
  return span(start.row, end.row).flatMap((row) =>
    span(start.column, end.column).map((column) => addressOf({ column, row })),
  );
};
