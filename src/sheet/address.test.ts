import { describe, expect, it } from 'vitest';
import { cellBelow } from './address.ts';

describe('cellBelow', () => {
  it.each([
    ['A1', 'A2'],
    ['B9', 'B10'],
    ['XFD99', 'XFD100'],
  ])('puts the cell below %s at %s', (address, below) => {
    expect(cellBelow(address)).toBe(below);
  });
});
