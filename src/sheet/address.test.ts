import { describe, expect, it } from 'vitest';
import { cellBelow, cellsIn } from './address.ts';

describe('cellBelow', () => {
  it.each([
    ['A1', 'A2'],
    ['B9', 'B10'],
    ['XFD99', 'XFD100'],
  ])('puts the cell below %s at %s', (address, below) => {
    expect(cellBelow(address)).toBe(below);
  });
});

describe('cellsIn', () => {
  it.each([
    { range: 'C3', cells: ['C3'] },
    { range: 'A1:B2', cells: ['A1', 'B1', 'A2', 'B2'] },
    { range: 'B2:A1', cells: ['A1', 'B1', 'A2', 'B2'] },
    { range: 'Z1:AA1', cells: ['Z1', 'AA1'] },
  ])('lists $range row by row', ({ range, cells }) => {
    expect(cellsIn(range)).toEqual(cells);
  });
});
