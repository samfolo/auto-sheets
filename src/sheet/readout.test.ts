import { describe, expect, it } from 'vitest';
import { describesSelection, parseReadout } from './readout.ts';

/** Labels copied from Excel for the web on 26 September 2026. */
describe('parseReadout', () => {
  it.each([
    { label: '2 . A1 . ', address: 'A1', display: '2', annotations: [] },
    {
      label: '5 . A3 . Contains Formula . ',
      address: 'A3',
      display: '5',
      annotations: ['Contains Formula'],
    },
    {
      label: '#DIV/0! . B2 . Contains error . ',
      address: 'B2',
      display: '#DIV/0!',
      annotations: ['Contains error'],
    },
    {
      label: '=1+ . D1 . The formula in this cell contains an error. . ',
      address: 'D1',
      display: '=1+',
      annotations: ['The formula in this cell contains an error.'],
    },
    { label: 'C5 . ', address: 'C5', display: '', annotations: [] },
    { label: 'A1 . A1 . ', address: 'A1', display: 'A1', annotations: [] },
    { label: '7  \n . G4 . ', address: 'G4', display: '7  \n', annotations: [] },
  ])('reads $label', ({ label, address, display, annotations }) => {
    expect(parseReadout(label, address)).toEqual({ display, annotations });
  });

  it('returns null when the label describes a different cell', () => {
    expect(parseReadout('5 . A3 . ', 'B7')).toBeNull();
  });
});

describe('describesSelection', () => {
  it.each([
    { label: '1 . Selected range . B1:B3 . ', range: 'B1:B3', describes: true },
    { label: '2 . Selected range . A1:B3 . Contains Formula . ', range: 'A1:B3', describes: true },
    { label: '1 . Selected range . B1:B3 . ', range: 'B1:B4', describes: false },
    { label: '5 . A3 . Contains Formula . ', range: 'A3', describes: true },
    { label: '5 . A3 . ', range: 'A4', describes: false },
  ])('$describes for $range in $label', ({ label, range, describes }) => {
    expect(describesSelection(label, range)).toBe(describes);
  });
});
