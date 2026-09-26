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

/**
 * What an exploration concentrates on: where it aims, how each sequence begins, and the gestures
 * that follow. `mixed` samples everything a person might do; `areas` builds up complicated
 * selections of many separate areas with Command held, as Sam suggested, which is where Excel's
 * selections and their shading get interesting.
 */
interface Focus {
  readonly space: Space;
  readonly start: readonly Gesture[];
  readonly gestures: readonly Gesture[];
}

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

export const FOCUSES = {
  mixed: {
    space: { columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], rows: 12 },
    start: MIXED,
    gestures: MIXED,
  },
  // Fourteen columns: the most that fit the checker's window on a clone with wider cells.
  areas: {
    space: {
      columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'],
      rows: 20,
    },
    start: [
      (random, space) => ({ do: 'drag', from: cell(random, space), to: cell(random, space) }),
    ],
    gestures: COMMAND_GESTURES,
  },
} as const satisfies Record<string, Focus>;

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
  const random = seededRandom(seedOf(focus, seed, index));
  const { space, start, gestures } = FOCUSES[focus];
  const gesture = (step: number) => pick(random, step === 0 ? start : gestures)(random, space);
  return {
    description: `An explored sequence of ${length} random gestures (${focus} focus, seed ${seed}, number ${index}); the recording says what Excel selected after each.`,
    tags: [CASE_TAGS.explored],
    steps: Array.from({ length }, (_, step) => [gesture(step), OBSERVE_SELECTION]).flat(),
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
