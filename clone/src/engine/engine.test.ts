/**
 * Table-driven tests for the sheet's rules: how entries are read, what formulas calculate,
 * how errors propagate, and how references move when a formula is filled or pasted.
 */
import { describe, expect, it } from 'vitest';
import { parseEntry } from './entry.js';
import { Sheet } from './sheet.js';
import { shiftFormula } from './refs.js';
import { Session } from './session.js';

const sheetWith = (entries: Record<string, string>): Sheet => {
  const sheet = new Sheet();
  for (const [address, text] of Object.entries(entries)) {
    const match = /^([A-Z]+)(\d+)$/.exec(address)!;
    const col = match[1]!.charCodeAt(0) - 65;
    sheet.set(col, Number(match[2]) - 1, parseEntry(text));
  }
  return sheet;
};

const read = (
  sheet: Sheet,
  address: string,
): { raw: string; display: string; annotations: string[] } => {
  const match = /^([A-Z]+)(\d+)$/.exec(address)!;
  const col = match[1]!.charCodeAt(0) - 65;
  const row = Number(match[2]) - 1;
  return sheet.view(col, row);
};

const ENTRY_CASES: [string, string, string][] = [
  ['001', '1', '1'],
  ['1.0', '1', '1'],
  ['(5)', '-5', '-5'],
  ['1e3', '1000', '1.00E+03'],
  ['50%', '50%', '50%'],
  ["'007", "'007", '007'],
  ['TRUE', 'TRUE', 'TRUE'],
];

describe('entry', () => {
  it.each(ENTRY_CASES)('reads %s as raw %s shown as %s', (typed, raw, display) => {
    const sheet = sheetWith({ A1: typed });
    expect(read(sheet, 'A1')).toMatchObject({ raw, display });
  });
});

const FORMULA_CASES: [string, string][] = [
  ['=1+2', '3'],
  ['=-2^2', '4'],
  ['=0-2^2', '-4'],
  ['=2^3^2', '64'],
  ['=0.1+0.2', '0.3'],
  ['="a"&1', 'a1'],
  ['=SUM(A1:A2)', '3'],
];

describe('formulas', () => {
  it.each(FORMULA_CASES)('%s shows %s', (formula, display) => {
    const sheet = sheetWith({ A1: '1', A2: '2', B1: formula });
    expect(read(sheet, 'B1').display).toBe(display);
  });

  it('propagates #DIV/0! through SUM', () => {
    const sheet = sheetWith({ A1: '=1/0', B1: '=A1+1', C1: '=SUM(A1:B1)' });
    expect(read(sheet, 'C1').display).toBe('#DIV/0!');
    expect(read(sheet, 'C1').annotations).toEqual(['Contains error']);
  });

  it('keeps a broken formula as typed but completes brackets', () => {
    const sheet = sheetWith({ A1: '=1+', A2: '=SUM(1,2' });
    expect(read(sheet, 'A1')).toMatchObject({
      raw: '=1+',
      display: '=1+',
      annotations: ['The formula in this cell contains an error.'],
    });
    expect(read(sheet, 'A2')).toMatchObject({ raw: '=SUM(1,2)', display: '3' });
  });
});

describe('references', () => {
  it('shifts relative parts and keeps absolute parts', () => {
    expect(shiftFormula('=B1*2', 1, 0)).toBe('=B2*2');
    expect(shiftFormula('=$B$1+B1', 1, 0)).toBe('=$B$1+B2');
    expect(shiftFormula('=A1*2', 3, 1)).toBe('=B4*2');
  });
});

describe('history', () => {
  it('undoes one entry at a time and redoes it', () => {
    const session = new Session();
    session.selectRange('A1');
    session.commit('1', false, 'none');
    expect(session.cellView(0, 0).raw).toBe('1');
    session.undo();
    expect(session.cellView(0, 0).raw).toBe('');
    session.redo();
    expect(session.cellView(0, 0).raw).toBe('1');
  });
});
