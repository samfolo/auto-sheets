/**
 * Exploring an interface nobody has listed. A person thinks of a fraction of the interactions a
 * product supports, so the factory also generates them: seeded random sequences of gestures
 * (clicks, drags, header and corner clicks, with Shift or Command held or not; arrow keys, Tab
 * and Enter, with Shift or not; select-all and undo), each followed by a look at the selection. Each sequence is written as a case and recorded on Excel
 * twice; one whose recordings disagree is discarded. The same seed always gives the same cases,
 * so an exploration can be repeated and reviewed, and a case already recorded is never touched.
 */
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { HELD_KEYS, type ActionStep, type PointerTarget, type Step } from '../sheet/index.ts';
import {
  ok,
  PATHS,
  type Result,
  seededRandom,
  type Trace,
  validate,
  writeJsonFile,
} from '../kernel/index.ts';
import { CASE_FILES } from './repository.ts';
import { CASE_TAGS, exploreOptionsSchema, type Case } from './contract.ts';
import { recordCase } from './record.ts';

export const EXPLORE = {
  /** The area explored cases go in. */
  area: 'explore',
  /** How often a mixed gesture holds a key. */
  holdChance: 0.35,
  /**
   * The keys explored: they move within the sheet's top-left without scrolling it, which would
   * move the grid the driver measured. Command with an arrow jumps to the sheet's edge, so only
   * Shift is held with them.
   */
  keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'],
} as const;

/** The look at the selection that follows every gesture. */
const OBSERVE_SELECTION: Step = { do: 'observe-selection' };

type Random = () => number;

/** The cells and headers a focus aims at: the top-left of a new sheet, well inside the window. */
interface Space {
  readonly columns: readonly string[];
  readonly rows: number;
}

type Gesture = (random: Random, space: Space) => ActionStep;

const pick = <T>(random: Random, items: readonly T[]): T => {
  const item = items[Math.floor(random() * items.length)];
  // Every list here is a fixed, non-empty table.
  if (item === undefined) throw new Error('Picked from an empty list.');
  return item;
};

const column = (random: Random, { columns }: Space): string => pick(random, columns);
const row = (random: Random, { rows }: Space): number => 1 + Math.floor(random() * rows);
const cell = (random: Random, space: Space): string =>
  `${column(random, space)}${row(random, space)}`;
const header = (random: Random, space: Space): PointerTarget =>
  pick(random, [column, row])(random, space);
const hold = (random: Random) =>
  random() < EXPLORE.holdChance ? { hold: [pick(random, HELD_KEYS)] } : {};
const shift = (random: Random) =>
  random() < EXPLORE.holdChance ? { hold: ['Shift' as const] } : {};
const COMMAND = { hold: ['Command' as const] };

/** What a person might do next, with the mouse or the keyboard, each drawing what it aims at. */
const MIXED: readonly Gesture[] = [
  (random, space) => ({ do: 'click', cell: cell(random, space), ...hold(random) }),
  (random, space) => ({
    do: 'drag',
    from: cell(random, space),
    to: cell(random, space),
    ...hold(random),
  }),
  (random, space) => ({
    do: 'drag',
    from: header(random, space),
    to: cell(random, space),
    ...hold(random),
  }),
  (random, space) => ({ do: 'click-column', column: column(random, space), ...hold(random) }),
  (random, space) => ({ do: 'click-row', row: row(random, space), ...hold(random) }),
  () => ({ do: 'click-corner' }),
  (random) => ({ do: 'press', key: pick(random, EXPLORE.keys), ...shift(random) }),
  () => ({ do: 'select-all' }),
  () => ({ do: 'undo' }),
];

/** Adding to a selection with Command held: cells, ranges, headers, and drags across headers. */
const COMMAND_GESTURES: readonly Gesture[] = [
  (random, space) => ({ do: 'click', cell: cell(random, space), ...COMMAND }),
  (random, space) => ({
    do: 'drag',
    from: cell(random, space),
    to: cell(random, space),
    ...COMMAND,
  }),
  (random, space) => ({ do: 'click-column', column: column(random, space), ...COMMAND }),
  (random, space) => ({ do: 'click-row', row: row(random, space), ...COMMAND }),
  (random, space) => ({
    do: 'drag',
    from: column(random, space),
    to: column(random, space),
    ...COMMAND,
  }),
  (random, space) => ({ do: 'drag', from: row(random, space), to: row(random, space), ...COMMAND }),
];

/** Writes a sequence of steps from its randomness: `length` gestures, each followed by a look. */
type Sequence = (random: Random, length: number) => Step[];

/** Gestures from a table, the first from its own, each followed by a look at the selection. */
const gestureSequence =
  (space: Space, start: readonly Gesture[], gestures: readonly Gesture[]): Sequence =>
  (random, length) =>
    Array.from({ length }, (_, step) => [
      pick(random, step === 0 ? start : gestures)(random, space),
      OBSERVE_SELECTION,
    ]).flat();

/** Where entry sequences write: a small block, so formulas can refer to what came before. */
const ENTRY_SPACE: Space = { columns: ['A', 'B', 'C', 'D', 'E', 'F'], rows: 8 };

/** What entry sequences type: numbers in the forms people use, and a few words. */
const ENTRY = {
  numbers: ['1', '2', '3', '5', '10', '2.5', '-4', '0', '100', '7%'],
  words: ['apple', 'Total', 'x', 'yes'],
  /** What a double-click adds to the end of a cell's content. */
  appended: ['1', '0', '5'],
  /** How often a gesture types a formula, once there is something to refer to, and a word. */
  formulaChance: 0.4,
  wordChance: 0.15,
  /** How many of the cells written so far each look observes, the latest first. */
  observed: 6,
} as const;

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
  if (written.length > 0 && random() < ENTRY.formulaChance) {
    return pick(random, FORMULAS)(pick(random, written), pick(random, written));
  }
  return random() < ENTRY.wordChance ? pick(random, ENTRY.words) : pick(random, ENTRY.numbers);
};

/** A route's steps, and the cell it wrote, if it wrote one. */
interface Entry {
  readonly steps: readonly Step[];
  readonly wrote: string | null;
}

type Route = (random: Random, target: string, text: string, written: readonly string[]) => Entry;

/** The ways content reaches a cell, as a person uses them, and undo and redo. */
const ENTRY_ROUTES: readonly Route[] = [
  (_, target, text) => ({ steps: [{ do: 'enter', cell: target, text }], wrote: target }),
  (_, target, text) => ({
    steps: [
      { do: 'click', cell: target },
      { do: 'type', text, commit: true },
    ],
    wrote: target,
  }),
  (random, target, text) => ({
    steps: [
      { do: 'click', cell: target },
      { do: 'type', text, commit: false },
      { do: 'click', cell: cell(random, ENTRY_SPACE) },
    ],
    wrote: target,
  }),
  (_, target, text) => ({
    steps: [
      { do: 'click', cell: target },
      { do: 'edit-in-formula-bar', text },
    ],
    wrote: target,
  }),
  (random, target, text, written) => {
    if (written.length === 0)
      return { steps: [{ do: 'enter', cell: target, text }], wrote: target };
    const reopened = pick(random, written);
    return {
      steps: [
        { do: 'double-click', cell: reopened },
        { do: 'type', text: pick(random, ENTRY.appended), commit: true },
      ],
      wrote: reopened,
    };
  },
  () => ({ steps: [{ do: 'undo' }], wrote: null }),
  () => ({ steps: [{ do: 'redo' }], wrote: null }),
];

/**
 * Entry: numbers, words and formulas that refer to what was written before, typed by every route
 * a person uses, with undo and redo among them; after each, a look at the latest cells written.
 */
const entrySequence: Sequence = (random, length) => {
  const written: string[] = [];
  return Array.from({ length }, () => {
    const target = cell(random, ENTRY_SPACE);
    const { steps, wrote } = pick(random, ENTRY_ROUTES)(
      random,
      target,
      content(random, written),
      written,
    );
    if (wrote !== null && !written.includes(wrote)) written.push(wrote);
    const latest = written.slice(-ENTRY.observed).toReversed();
    return [...steps, ...(latest.length === 0 ? [] : [{ do: 'observe', cells: latest } as const])];
  }).flat();
};

/**
 * What an exploration concentrates on, and what it looks at after each gesture. `mixed` samples
 * everything a person might do; `areas` builds up selections of many separate areas with Command
 * held, where Excel's selections get complicated; `entry` fills in values and formulas that refer
 * to each other, by every route in.
 */
export const FOCUSES = {
  mixed: {
    looksAt: 'what Excel selected',
    sequence: gestureSequence(
      { columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], rows: 12 },
      MIXED,
      MIXED,
    ),
  },
  // Fourteen columns: the most that fit the checker's window on a clone with wider cells.
  areas: {
    looksAt: 'what Excel selected',
    sequence: gestureSequence(
      {
        columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'],
        rows: 20,
      },
      [(random, space) => ({ do: 'drag', from: cell(random, space), to: cell(random, space) })],
      COMMAND_GESTURES,
    ),
  },
  entry: { looksAt: 'what Excel showed in the cells written', sequence: entrySequence },
} as const satisfies Record<string, { looksAt: string; sequence: Sequence }>;

export type FocusName = keyof typeof FOCUSES;

/**
 * Where a sequence's randomness starts. `mixed` keeps the form it had before focuses existed,
 * so the cases it already produced can still be produced again.
 */
const seedOf = (focus: FocusName, seed: number, index: number): string =>
  focus === 'mixed'
    ? `${EXPLORE.area}:${seed}:${index}`
    : `${EXPLORE.area}:${focus}:${seed}:${index}`;

/** A sequence's case id, under the explore area. */
export const exploredId = (focus: FocusName, seed: number, index: number): string =>
  `${EXPLORE.area}/${focus === 'mixed' ? '' : `${focus}-`}seed-${seed}-${index}`;

/** The case for one sequence: gestures, each followed by a look at the selection. */
export const exploredCase = (
  seed: number,
  index: number,
  length: number,
  focus: FocusName = 'mixed',
): Case => {
  const { looksAt, sequence } = FOCUSES[focus];
  return {
    description: `An explored sequence of ${length} random gestures (${focus} focus, seed ${seed}, number ${index}); the recording says ${looksAt} after each.`,
    tags: [CASE_TAGS.explored],
    steps: sequence(seededRandom(seedOf(focus, seed, index)), length),
  };
};

/** What happened to one sequence. */
type Outcome = 'recorded' | 'discarded' | 'kept';

/** What one exploration found. */
export interface Exploration {
  /** Newly recorded cases. */
  readonly recorded: readonly string[];
  /** Sequences whose two recordings disagreed, so nothing was kept. */
  readonly discarded: readonly string[];
  /** Cases this seed had already produced, left as they were. */
  readonly kept: readonly string[];
}

/** Writes and records one sequence, unless it already exists; removes it if Excel was unstable. */
const exploreOne = async (id: string, explored: Case, trace: Trace): Promise<Result<Outcome>> => {
  const file = join(PATHS.excelCases, ...id.split('/'), CASE_FILES.definition);
  if (existsSync(file)) return ok('kept');
  const written = await writeJsonFile(file, explored);
  if (!written.success) return written;
  const recording = await recordCase(id, trace);
  trace('case.explored', {
    id,
    recorded: recording.success,
    differences: recording.success ? [] : (recording.error.details ?? [recording.error.message]),
  });
  if (recording.success) return ok('recorded');
  await rm(dirname(file), { recursive: true, force: true });
  return ok('discarded');
};

/** Generates, writes and records each sequence, keeping only those Excel repeats exactly. */
export const exploreCases = async (
  request: Readonly<Record<string, unknown>>,
  trace: Trace,
): Promise<Result<Exploration>> => {
  const options = validate(exploreOptionsSchema, request, 'the explore options');
  if (!options.success) return options;
  const { seed, count, steps, focus } = options.data;
  const found: Record<Outcome, string[]> = { recorded: [], discarded: [], kept: [] };
  for (let index = 1; index <= count; index += 1) {
    const id = exploredId(focus, seed, index);
    // Each sequence drives the one browser session, so they run one at a time.
    // oxlint-disable-next-line no-await-in-loop
    const outcome = await exploreOne(id, exploredCase(seed, index, steps, focus), trace);
    if (!outcome.success) return outcome;
    found[outcome.data].push(id);
  }
  return ok(found);
};

export const renderExploration = ({ recorded, discarded, kept }: Exploration): string =>
  [
    ...recorded.map((id) => `● ${id}`),
    ...kept.map((id) => `○ ${id}: already recorded, left as it was`),
    ...discarded.map((id) => `✖ ${id}: the two recordings disagreed, so it was discarded`),
    `Recorded ${recorded.length} new sequences; ${discarded.length} discarded, ${kept.length} already there.`,
  ].join('\n');
