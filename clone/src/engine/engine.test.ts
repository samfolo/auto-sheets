// Tests for the engine rules, mirroring the recorded cases.

import { describe, expect, it } from 'vitest';
import { parseArea, areaName, parseCell, type CellAddr } from './address.ts';
import { contentRaw, literalDisplay, parseEntry } from './content.ts';
import { Workbook } from './workbook.ts';
import {
  clickCell,
  clickCol,
  clickRow,
  clickCorner,
  drag,
  initialSelection,
  selectAll,
  selectArea,
  type Selection,
} from './selection.ts';
import { keyMove } from './movement.ts';

const cell = (name: string): CellAddr => {
  const c = parseCell(name);
  if (!c) throw new Error(`bad cell ${name}`);
  return c;
};

describe('entry parsing', () => {
  const cases: [string, string, string][] = [
    ['001', '1', '1'],
    ['1.0', '1', '1'],
    ['(5)', '-5', '-5'],
    ['1e3', '1000', '1.00E+03'],
    ['50%', '50%', '50%'],
    ["'007", "'007", '007'],
    ['TRUE', 'TRUE', 'TRUE'],
    ['  7  ', '7', '7'],
    [' x', ' x', ' x'],
  ];
  it.each(cases)('%s → raw %s display %s', (typed, raw, display) => {
    const wb = new Workbook();
    wb.enter(cell('A1'), typed);
    const view = wb.cellView(cell('A1'));
    expect(view.raw).toBe(raw);
    expect(view.display).toBe(display);
    expect(view.annotations).toEqual([]);
  });

  it('reads 1/2 as a date, month first, current year', () => {
    const wb = new Workbook();
    wb.enter(cell('A1'), '1/2');
    const view = wb.cellView(cell('A1'));
    expect(view.raw).toBe(`1/2/${new Date().getFullYear()}`);
    expect(view.display).toBe('2-Jan');
  });
});

describe('formulas', () => {
  const cases: [string, string, string[]][] = [
    ['=-2^2', '4', ['Contains Formula']],
    ['=0-2^2', '-4', ['Contains Formula']],
    ['=2^3^2', '64', ['Contains Formula']],
    ['=0.1+0.2', '0.3', ['Contains Formula']],
    ['=1/0', '#DIV/0!', ['Contains error']],
    ['="a"&1', 'a1', ['Contains Formula']],
    ['=SUM(1,2', '3', ['Contains Formula']],
    ['=1+', '=1+', ['The formula in this cell contains an error.']],
    ['=SUM(1,2,3)', '6', ['Contains Formula']],
    ['=IF(0,1/0,7)', '7', ['Contains Formula']],
    ['=1+1=2', 'TRUE', ['Contains Formula']],
    ['=AVERAGE(2,4)', '3', ['Contains Formula']],
    ['=ROUND(2.15,1)', '2.2', ['Contains Formula']],
    ['=ROUND(-1.475,2)', '-1.48', ['Contains Formula']],
  ];
  it.each(cases)('%s → %s', (typed, display, annotations) => {
    const wb = new Workbook();
    wb.enter(cell('A1'), typed);
    const view = wb.cellView(cell('A1'));
    expect(view.display).toBe(display);
    expect(view.annotations).toEqual(annotations);
    expect(view.raw).toBe(typed === '=SUM(1,2' ? '=SUM(1,2)' : typed);
  });

  it('spreads #DIV/0! to dependants and SUM', () => {
    const wb = new Workbook();
    wb.enter(cell('A1'), '=1/0');
    wb.enter(cell('B1'), '=A1+1');
    wb.enter(cell('C1'), '=SUM(A1:B1)');
    for (const addr of ['A1', 'B1', 'C1']) {
      const view = wb.cellView(cell(addr));
      expect(view.display).toBe('#DIV/0!');
      expect(view.annotations).toEqual(['Contains error']);
    }
  });

  it('SUM of empty cells is 0', () => {
    const wb = new Workbook();
    wb.enter(cell('A3'), '=SUM(A1:A2)');
    expect(wb.cellView(cell('A3')).display).toBe('0');
  });
});

describe('history', () => {
  it('undo and redo restore inputs and results', () => {
    const wb = new Workbook();
    wb.enter(cell('A1'), '1');
    wb.enter(cell('B1'), '=A1*10');
    wb.enter(cell('A1'), '2');
    expect(wb.cellView(cell('B1')).display).toBe('20');
    wb.undo();
    expect(wb.cellView(cell('A1')).display).toBe('1');
    expect(wb.cellView(cell('B1')).display).toBe('10');
    wb.redo();
    expect(wb.cellView(cell('B1')).display).toBe('20');
  });

  it('clearing a range is one undo step', () => {
    const wb = new Workbook();
    wb.enter(cell('A1'), '1');
    wb.enter(cell('A2'), '2');
    wb.enter(cell('A3'), '=SUM(A1:A2)');
    wb.clear([cell('A1'), cell('A2')]);
    expect(wb.cellView(cell('A3')).display).toBe('0');
    wb.undo();
    expect(wb.cellView(cell('A3')).display).toBe('3');
  });
});

describe('references', () => {
  it('fill down adjusts relative references only', () => {
    const wb = new Workbook();
    wb.enter(cell('B1'), '1');
    wb.enter(cell('B2'), '2');
    wb.enter(cell('B3'), '3');
    wb.enter(cell('A1'), '=B1*2');
    wb.enter(cell('C1'), '=$B$1+B1');
    wb.fillDown({ c1: 1, r1: 1, c2: 1, r2: 3 });
    wb.fillDown({ c1: 3, r1: 1, c2: 3, r2: 3 });
    expect(wb.cellView(cell('A2')).raw).toBe('=B2*2');
    expect(wb.cellView(cell('A3')).raw).toBe('=B3*2');
    expect(wb.cellView(cell('C2')).raw).toBe('=$B$1+B2');
    expect(wb.cellView(cell('C2')).display).toBe('3');
  });

  it('pasting a formula shifts its references', () => {
    const wb = new Workbook();
    wb.enter(cell('A1'), '5');
    wb.enter(cell('A2'), '=A1*2');
    wb.copy({ c1: 1, r1: 2, c2: 1, r2: 2 });
    wb.paste(cell('C2'));
    wb.paste(cell('B5'));
    expect(wb.cellView(cell('C2')).raw).toBe('=C1*2');
    expect(wb.cellView(cell('B5')).raw).toBe('=B4*2');
  });
});

const names = (sel: Selection): string[] => sel.areas.map(areaName);

describe('selection', () => {
  it('click, drag, headers and corner', () => {
    let sel = initialSelection();
    sel = drag(sel, { type: 'cell', cell: cell('C3') }, { type: 'cell', cell: cell('E6') }, {});
    expect(names(sel)).toEqual(['C3:E6']);
    expect(sel.active).toEqual(cell('C3'));
    sel = clickCol(sel, 11, {});
    expect(names(sel)).toEqual(['K:K']);
    expect(sel.active).toEqual(cell('K1'));
    sel = clickRow(sel, 5, {});
    expect(names(sel)).toEqual(['5:5']);
    expect(sel.active).toEqual(cell('A5'));
    sel = clickCorner();
    expect(names(sel)).toEqual(['A:XFD']);
    expect(sel.active).toEqual(cell('A1'));
  });

  it('command-click adds and removes areas', () => {
    let sel = initialSelection();
    sel = clickRow(sel, 3, {});
    sel = clickRow(sel, 5, { cmd: true });
    expect(names(sel)).toEqual(['3:3', '5:5']);
    expect(sel.active).toEqual(cell('A5'));
    sel = clickRow(sel, 3, { cmd: true });
    expect(names(sel)).toEqual(['5:5']);
    expect(sel.active).toEqual(cell('A5'));
  });

  it('command-click subtracts a cell and fragments areas in order', () => {
    let sel = initialSelection();
    sel = drag(sel, { type: 'col', col: 3 }, { type: 'col', col: 14 }, {});
    sel = clickCell(sel, cell('H9'), { cmd: true });
    expect(names(sel)).toEqual(['C10:N1048576', 'I9:N9', 'C9:G9', 'C1:N8']);
    expect(sel.active).toEqual(cell('C1'));
  });

  it('command-drag over selected rows subtracts them', () => {
    let sel = initialSelection();
    sel = drag(sel, { type: 'cell', cell: cell('I8') }, { type: 'cell', cell: cell('I6') }, {});
    expect(names(sel)).toEqual(['I6:I8']);
    expect(sel.active).toEqual(cell('I8'));
    sel = clickCell(sel, cell('J20'), { cmd: true });
    sel = clickRow(sel, 12, { cmd: true });
    sel = clickCol(sel, 12, { cmd: true });
    sel = drag(sel, { type: 'row', row: 6 }, { type: 'row', row: 5 }, { cmd: true });
    expect(names(sel)).toEqual(['I6:I8', 'J20', '12:12', 'L:L', '5:6']);
    sel = clickRow(sel, 6, { cmd: true });
    expect(names(sel)).toEqual(['I7:I8', 'J20', '12:12', 'L7:L1048576', 'L1:L5', '5:5']);
    expect(sel.active).toEqual(cell('A5'));
  });

  it('select-all keeps the active cell and replaces its area', () => {
    let sel = initialSelection();
    sel = clickCell(sel, cell('C3'), {});
    sel = selectAll(sel);
    expect(names(sel)).toEqual(['A:XFD']);
    expect(sel.active).toEqual(cell('C3'));
  });

  it('shift-click and shift-arrows extend from the active cell', () => {
    let sel = initialSelection();
    sel = clickCell(sel, cell('B2'), {});
    sel = clickCell(sel, cell('D5'), { shift: true });
    expect(names(sel)).toEqual(['B2:D5']);
    expect(sel.active).toEqual(cell('B2'));
    sel = clickCol(sel, 6, { shift: true });
    expect(names(sel)).toEqual(['B:F']);
    expect(sel.active).toEqual(cell('B2'));
    sel = clickCell(sel, cell('B2'), {});
    sel = keyMove(keyMove(keyMove(sel, 'ArrowDown', true), 'ArrowDown', true), 'ArrowRight', true);
    expect(names(sel)).toEqual(['B2:C4']);
    sel = keyMove(sel, 'ArrowUp', true);
    expect(names(sel)).toEqual(['B2:C3']);
  });

  it('enter and tab move inside the selection', () => {
    let sel = initialSelection();
    const area = parseArea('C3:C5');
    if (!area) throw new Error('bad area');
    sel = selectArea(area);
    sel = keyMove(sel, 'Enter', false);
    expect(sel.active).toEqual(cell('C4'));
    expect(names(sel)).toEqual(['C3:C5']);
    sel = keyMove(sel, 'Enter', false);
    expect(sel.active).toEqual(cell('C5'));
    sel = keyMove(sel, 'Enter', false);
    expect(sel.active).toEqual(cell('C3'));
    sel = initialSelection();
    sel = keyMove(sel, 'Enter', true);
    expect(sel.active).toEqual(cell('A1'));
  });

  it('arrows collapse the selection and move', () => {
    let sel = initialSelection();
    sel = clickCell(sel, cell('B2'), {});
    sel = keyMove(sel, 'ArrowRight', false);
    expect(sel.active).toEqual(cell('C2'));
    expect(names(sel)).toEqual(['C2']);
    sel = keyMove(sel, 'Tab', false);
    expect(sel.active).toEqual(cell('D2'));
  });

  it('drags from headers select whole columns or rows', () => {
    let sel = initialSelection();
    sel = drag(sel, { type: 'col', col: 2 }, { type: 'cell', cell: cell('D8') }, {});
    expect(names(sel)).toEqual(['B:D']);
    expect(sel.active).toEqual(cell('B1'));
    sel = drag(sel, { type: 'row', row: 2 }, { type: 'cell', cell: cell('C4') }, {});
    expect(names(sel)).toEqual(['2:4']);
    expect(sel.active).toEqual(cell('A2'));
  });
});

describe('literal display', () => {
  it('formats raw and display for non-formula entries', () => {
    const content = parseEntry('123E5');
    expect(contentRaw(content)).toBe('12300000');
    expect(literalDisplay(content)).toBe('1.23E+07');
  });
});
