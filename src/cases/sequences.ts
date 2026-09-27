/**
 * What exploration tries. A focus writes a sequence of steps from a stream of random numbers: it
 * draws gestures from its own table, aims them at cells in its own space, and looks after each.
 * Nothing is uniform by accident: the tables, the spaces and the chances below are the levers that
 * make some behaviour likelier, so an exploration spends its steps where Excel is intricate.
 *
 * Every committed explored case is generated again by the tests, so a change here that would
 * change what a seed produces is caught; add new draws after existing ones, or in a new focus.
 */
import { chance, pick, type Random, upTo } from '../kernel/index.ts';
import { type ActionStep, columnLetters, HELD_KEYS, type Step } from '../sheet/index.ts';
import type { FocusName } from './contract.ts';

/** The cells and headers a focus aims at: the first columns and rows of a new sheet. */
interface Space {
  readonly columns: number;
  readonly rows: number;
}

/**
 * Where each focus aims: the top-left of a new sheet, well inside the window, since scrolling
 * would move the grid the driver measured.
 */
const SPACES = {
  mixed: { columns: 8, rows: 12 },
  /** Wide enough for a dozen or more separate areas; fourteen columns is the most that fit the checker's window on a clone with wider cells. */
  areas: { columns: 14, rows: 20 },
  /** A small block, so formulas often refer to what came before. */
  entry: { columns: 6, rows: 8 },
} as const satisfies Record<string, Space>;

/** How gestures are drawn. */
const GESTURES = {
  /** How often a mixed gesture holds Shift or Command. */
  holdChance: 0.35,
  /**
   * The keys pressed: they move within the sheet's top-left without scrolling it. Command with an
   * arrow jumps to the sheet's edge, so only Shift is held with them.
   */
  keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'],
} as const;

/** How entries are drawn. */
const ENTRY = {
  /** Numbers in the forms people type. */
  numbers: ['1', '2', '3', '5', '10', '2.5', '-4', '0', '100', '7%'],
  words: ['apple', 'Total', 'x', 'yes'],
  /** What a double-click adds to the end of a cell's content. */
  appended: ['1', '0', '5'],
  /** How often an entry is a formula, once there is something to refer to. */
  formulaChance: 0.4,
  /** How often an entry that isn't a formula is a word rather than a number. */
  wordChance: 0.15,
  /** How many of the cells written so far each look observes, the latest first. */
  observed: 6,
} as const;

const column = (random: Random, { columns }: Space): string => columnLetters(upTo(random, columns));
const row = (random: Random, { rows }: Space): number => upTo(random, rows);
const cell = (random: Random, space: Space): string =>
  `${column(random, space)}${row(random, space)}`;
const header = (random: Random, space: Space): string | number =>
  pick(random, [column, row])(random, space);

type Gesture = (random: Random, space: Space) => ActionStep;
type Holdable = Extract<ActionStep, { do: 'click' | 'drag' | 'click-column' | 'click-row' }>;
type HoldableGesture = (random: Random, space: Space) => Holdable;

const clickCell: HoldableGesture = (random, space) => ({ do: 'click', cell: cell(random, space) });
const dragCells: HoldableGesture = (random, space) => ({
  do: 'drag',
  from: cell(random, space),
  to: cell(random, space),
});
const dragFromHeader: HoldableGesture = (random, space) => ({
  do: 'drag',
  from: header(random, space),
  to: cell(random, space),
});
const clickColumn: HoldableGesture = (random, space) => ({
  do: 'click-column',
  column: column(random, space),
});
const clickRow: HoldableGesture = (random, space) => ({ do: 'click-row', row: row(random, space) });
const dragColumns: HoldableGesture = (random, space) => ({
  do: 'drag',
  from: column(random, space),
  to: column(random, space),
});
const dragRows: HoldableGesture = (random, space) => ({
  do: 'drag',
  from: row(random, space),
  to: row(random, space),
});

/** The gesture with Shift or Command held, sometimes. */
const sometimesHolding =
  (gesture: HoldableGesture): Gesture =>
  (random, space) => ({
    ...gesture(random, space),
    ...(chance(random, GESTURES.holdChance) ? { hold: [pick(random, HELD_KEYS)] } : {}),
  });

/** The gesture with Command held, which adds to the selection. */
const withCommand =
  (gesture: HoldableGesture): Gesture =>
  (random, space) => ({ ...gesture(random, space), hold: ['Command'] });

/** What a person might do next, with the mouse or the keyboard. */
const MIXED: readonly Gesture[] = [
  ...[clickCell, dragCells, dragFromHeader, clickColumn, clickRow].map(sometimesHolding),
  () => ({ do: 'click-corner' }),
  (random) => ({
    do: 'press',
    key: pick(random, GESTURES.keys),
    ...(chance(random, GESTURES.holdChance) ? { hold: ['Shift' as const] } : {}),
  }),
  () => ({ do: 'select-all' }),
  () => ({ do: 'undo' }),
];

/** Adding to a selection: cells, ranges, headers, and drags across headers, all with Command. */
const ADDING: readonly Gesture[] = [
  clickCell,
  dragCells,
  clickColumn,
  clickRow,
  dragColumns,
  dragRows,
].map(withCommand);

/** Writes a sequence of steps from its randomness: `length` gestures or entries, each followed by a look. */
type Sequence = (random: Random, length: number) => Step[];

/** Gestures from a table, the first from its own, each followed by a look at the selection. */
const gestureSequence =
  (space: Space, first: readonly Gesture[], rest: readonly Gesture[]): Sequence =>
  (random, length) =>
    Array.from({ length }, (_, step) => [
      pick(random, step === 0 ? first : rest)(random, space),
      { do: 'observe-selection' } as const,
    ]).flat();

/** Formulas over one or two cells written earlier, using the functions and operators in scope. */
const FORMULAS: readonly ((a: string, b: string) => string)[] = [
  (a, b) => `=${a}+${b}`,
  (a) => `=${a}*2`,
  (a, b) => `=${a}-${b}/2`,
  (a, b) => `=SUM(${a}:${b})`,
  (a, b) => `=AVERAGE(${a},${b})`,
  (a, b) => `=MAX(${a},${b})`,
  (a, b) => `=MIN(${a}:${b})`,
  (a, b) => `=COUNT(${a}:${b})`,
  (a) => `=IF(${a}>2,"big","small")`,
  (a) => `=ROUND(${a}/3,2)`,
  (a) => `=${a}&"!"`,
];

/** What to type next: a formula over cells already written, a number, or a word. */
const content = (random: Random, written: readonly string[]): string => {
  if (written.length > 0 && chance(random, ENTRY.formulaChance)) {
    return pick(random, FORMULAS)(pick(random, written), pick(random, written));
  }
  return chance(random, ENTRY.wordChance) ? pick(random, ENTRY.words) : pick(random, ENTRY.numbers);
};

/** A route's steps, and the cell it wrote, if it wrote one. */
interface Entry {
  readonly steps: readonly Step[];
  readonly wrote: string | null;
}

type Route = (random: Random, target: string, text: string, written: readonly string[]) => Entry;

const enter: Route = (_, target, text) => ({
  steps: [{ do: 'enter', cell: target, text }],
  wrote: target,
});
const clickAndType: Route = (_, target, text) => ({
  steps: [
    { do: 'click', cell: target },
    { do: 'type', text, commit: true },
  ],
  wrote: target,
});
/** Typing without Enter, then clicking another cell, which commits the entry. */
const typeAndClickAway: Route = (random, target, text) => ({
  steps: [
    { do: 'click', cell: target },
    { do: 'type', text, commit: false },
    { do: 'click', cell: cell(random, SPACES.entry) },
  ],
  wrote: target,
});
const typeInFormulaBar: Route = (_, target, text) => ({
  steps: [
    { do: 'click', cell: target },
    { do: 'edit-in-formula-bar', text },
  ],
  wrote: target,
});
/** Double-clicking a cell already written and adding to the end of it. */
const appendByDoubleClick: Route = (random, target, text, written) => {
  if (written.length === 0) return enter(random, target, text, written);
  const reopened = pick(random, written);
  return {
    steps: [
      { do: 'double-click', cell: reopened },
      { do: 'type', text: pick(random, ENTRY.appended), commit: true },
    ],
    wrote: reopened,
  };
};

/** The ways content reaches a cell, as a person uses them, and undo and redo. */
const ENTRY_ROUTES: readonly Route[] = [
  enter,
  clickAndType,
  typeAndClickAway,
  typeInFormulaBar,
  appendByDoubleClick,
  () => ({ steps: [{ do: 'undo' }], wrote: null }),
  () => ({ steps: [{ do: 'redo' }], wrote: null }),
];

/** Entries by any route, each followed by a look at the latest cells written. */
const entrySequence: Sequence = (random, length) => {
  const written: string[] = [];
  return Array.from({ length }, () => {
    const target = cell(random, SPACES.entry);
    const route = pick(random, ENTRY_ROUTES);
    const { steps, wrote } = route(random, target, content(random, written), written);
    if (wrote !== null && !written.includes(wrote)) written.push(wrote);
    const latest = written.slice(-ENTRY.observed).toReversed();
    return [...steps, ...(latest.length === 0 ? [] : [{ do: 'observe', cells: latest } as const])];
  }).flat();
};

/**
 * What an exploration concentrates on, and what it looks at after each gesture. `mixed` samples
 * everything a person might do; `areas` starts with a range and adds to it with Command held,
 * building selections of many separate areas, where Excel's rules get complicated; `entry` fills
 * in values and formulas that refer to each other, by every route in.
 */
export const FOCUSES = {
  mixed: {
    looksAt: 'what Excel selected',
    sequence: gestureSequence(SPACES.mixed, MIXED, MIXED),
  },
  areas: {
    looksAt: 'what Excel selected',
    sequence: gestureSequence(SPACES.areas, [dragCells], ADDING),
  },
  entry: { looksAt: 'what Excel showed in the cells written', sequence: entrySequence },
} as const satisfies Record<FocusName, { looksAt: string; sequence: Sequence }>;
