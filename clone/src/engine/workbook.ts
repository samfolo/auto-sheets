// The workbook: cell contents, recalculation, undo history, fill and copy/paste.

import { cellName, parseCell, type Area, type CellAddr } from './address.ts';
import {
  contentRaw,
  generalDisplay,
  literalDisplay,
  parseEntry,
  type CellContent,
} from './content.ts';
import { evalAst, scalarOf, type CellReader, type Scalar } from './formula-eval.ts';
import { parseFormula } from './formula-parse.ts';
import { shiftFormulaRefs } from './shift-refs.ts';

export interface CellView {
  addr: string;
  raw: string;
  display: string;
  annotations: string[];
  align: 'left' | 'right' | 'center';
}

interface Change {
  addr: string;
  before: CellContent;
  after: CellContent;
}

const key = (col: number, row: number): string => `${col},${row}`;

/** The in-memory workbook with its undo history. */
export class Workbook {
  private cells = new Map<string, CellContent>();
  private undoStack: Change[][] = [];
  private redoStack: Change[][] = [];
  private clipboard: { area: Area; contents: CellContent[][] } | null = null;
  revision = 0;

  reset(): void {
    this.cells = new Map();
    this.undoStack = [];
    this.redoStack = [];
    this.clipboard = null;
    this.revision += 1;
  }

  get(col: number, row: number): CellContent {
    return this.cells.get(key(col, row)) ?? { kind: 'empty' };
  }

  getByName(addr: string): CellContent {
    const cell = parseCell(addr);
    return cell ? this.get(cell.col, cell.row) : { kind: 'empty' };
  }

  /** Record one undoable change made of several cell writes. */
  private apply(writes: { addr: CellAddr; content: CellContent }[]): void {
    const changes: Change[] = [];
    for (const { addr, content } of writes) {
      const k = key(addr.col, addr.row);
      const before = this.cells.get(k) ?? { kind: 'empty' };
      changes.push({ addr: cellName(addr), before, after: content });
      if (content.kind === 'empty') this.cells.delete(k);
      else this.cells.set(k, content);
    }
    if (changes.length > 0) this.undoStack.push(changes);
    this.redoStack = [];
    this.revision += 1;
  }

  /** Store typed text in one cell (interpreting it as Excel would). */
  enter(addr: CellAddr, text: string): void {
    this.apply([{ addr, content: this.interpret(text) }]);
  }

  /** Store typed text in every listed cell, adjusting relative references. */
  enterMany(addrs: CellAddr[], text: string): void {
    const first = addrs[0];
    const base = this.interpret(text);
    this.apply(
      addrs.map((addr) => ({
        addr,
        content:
          base.kind === 'formula' && first
            ? this.interpret(shiftFormulaRefs(base.raw, addr.col - first.col, addr.row - first.row))
            : base,
      })),
    );
  }

  /** Clear every listed cell. */
  clear(addrs: CellAddr[]): void {
    this.apply(addrs.map((addr) => ({ addr, content: { kind: 'empty' } as CellContent })));
  }

  /** Copy the top row of the area down over the rest of it. */
  fillDown(area: Area): void {
    const writes: { addr: CellAddr; content: CellContent }[] = [];
    for (let c = area.c1; c <= area.c2; c += 1) {
      const source = this.get(c, area.r1);
      for (let r = area.r1 + 1; r <= area.r2; r += 1) {
        const content =
          source.kind === 'formula'
            ? this.interpret(shiftFormulaRefs(source.raw, 0, r - area.r1))
            : source;
        writes.push({ addr: { col: c, row: r }, content });
      }
    }
    this.apply(writes);
  }

  /** Remember an area for pasting. */
  copy(area: Area): void {
    const contents: CellContent[][] = [];
    for (let r = area.r1; r <= area.r2; r += 1) {
      const row: CellContent[] = [];
      for (let c = area.c1; c <= area.c2; c += 1) row.push(this.get(c, r));
      contents.push(row);
    }
    this.clipboard = { area, contents };
  }

  /** Paste the copied block with its top-left cell at the target. */
  paste(at: CellAddr): void {
    if (!this.clipboard) return;
    const { area, contents } = this.clipboard;
    const writes: { addr: CellAddr; content: CellContent }[] = [];
    contents.forEach((row, ri) => {
      row.forEach((content, ci) => {
        const addr = { col: at.col + ci, row: at.row + ri };
        const shifted =
          content.kind === 'formula'
            ? this.interpret(shiftFormulaRefs(content.raw, addr.col - area.c1, addr.row - area.r1))
            : content;
        writes.push({ addr, content: shifted });
      });
    });
    this.apply(writes);
  }

  undo(): void {
    const changes = this.undoStack.pop();
    if (!changes) return;
    for (const { addr, before } of [...changes].reverse()) this.setRaw(addr, before);
    this.redoStack.push(changes);
    this.revision += 1;
  }

  redo(): void {
    const changes = this.redoStack.pop();
    if (!changes) return;
    for (const { addr, after } of changes) this.setRaw(addr, after);
    this.undoStack.push(changes);
    this.revision += 1;
  }

  private setRaw(addr: string, content: CellContent): void {
    const cell = parseCell(addr);
    if (!cell) return;
    const k = key(cell.col, cell.row);
    if (content.kind === 'empty') this.cells.delete(k);
    else this.cells.set(k, content);
  }

  /** Interpret typed text, completing formulas and marking broken ones. */
  private interpret(text: string): CellContent {
    const content = parseEntry(text);
    if (content.kind !== 'formula') return content;
    const parsed = parseFormula(content.raw);
    if (!parsed) return { kind: 'formula', raw: content.raw, broken: true };
    return { kind: 'formula', raw: parsed.raw, broken: false };
  }

  /** Evaluate one cell to a scalar, with cycle protection. */
  private evaluateCell(col: number, row: number, visiting: Set<string>): Scalar {
    const k = key(col, row);
    if (visiting.has(k)) return { t: 'n', v: 0 };
    const content = this.get(col, row);
    if (content.kind !== 'formula') return scalarOfContent(content);
    if (content.broken) return { t: 's', v: content.raw };
    const parsed = parseFormula(content.raw);
    if (!parsed) return { t: 's', v: content.raw };
    visiting.add(k);
    const reader: CellReader = (c, r) => this.evaluateCell(c, r, visiting);
    const value = evalAst(parsed.ast, reader);
    visiting.delete(k);
    return scalarOf(value, reader);
  }

  /** The view of every non-empty cell, recalculated. */
  view(): CellView[] {
    const out: CellView[] = [];
    const entries = [...this.cells.keys()].map((k) => k.split(',').map(Number));
    entries.sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0) || (a[0] ?? 0) - (b[0] ?? 0));
    for (const coords of entries) {
      const col = coords[0] ?? 0;
      const row = coords[1] ?? 0;
      out.push(this.cellView({ col, row }));
    }
    return out;
  }

  /** The view of one cell. */
  cellView(addr: CellAddr): CellView {
    const content = this.get(addr.col, addr.row);
    const name = cellName(addr);
    if (content.kind === 'formula' && content.broken)
      return {
        addr: name,
        raw: content.raw,
        display: content.raw,
        annotations: ['The formula in this cell contains an error.'],
        align: 'left',
      };
    if (content.kind !== 'formula')
      return {
        addr: name,
        raw: contentRaw(content),
        display: literalDisplay(content),
        annotations: [],
        align: literalAlign(content),
      };
    const value = this.evaluateCell(addr.col, addr.row, new Set());
    const annotations: string[] = [];
    if (value.t === 'e') annotations.push('Contains error');
    else annotations.push('Contains Formula');
    return {
      addr: name,
      raw: contentRaw(content),
      display: displayScalar(value),
      annotations,
      align: scalarAlign(value),
    };
  }
}

/** Text alignment by value kind, as Excel aligns them by default. */
const literalAlign = (content: CellContent): 'left' | 'right' | 'center' => {
  switch (content.kind) {
    case 'number':
    case 'date':
      return 'right';
    case 'boolean':
      return 'center';
    default:
      return 'left';
  }
};

const scalarAlign = (value: Scalar): 'left' | 'right' | 'center' => {
  switch (value.t) {
    case 'n':
      return 'right';
    case 'b':
    case 'e':
      return 'center';
    default:
      return 'left';
  }
};

/** The scalar a literal cell evaluates to. */
const scalarOfContent = (content: CellContent): Scalar => {
  switch (content.kind) {
    case 'empty':
      return { t: 'empty' };
    case 'number':
      return { t: 'n', v: content.value };
    case 'text':
      return { t: 's', v: content.text };
    case 'boolean':
      return { t: 'b', v: content.value };
    case 'date':
      return { t: 'n', v: content.serial };
    case 'formula':
      return { t: 's', v: content.raw };
  }
};

/** How a computed scalar is displayed. */
const displayScalar = (value: Scalar): string => {
  switch (value.t) {
    case 'n':
      return generalDisplay(value.v);
    case 's':
      return value.v;
    case 'b':
      return value.v ? 'TRUE' : 'FALSE';
    case 'e':
      return value.v;
    case 'empty':
      return '';
  }
};
