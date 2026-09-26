/**
 * Exploring an interface nobody has listed. A person thinks of a fraction of the interactions a
 * product supports, so the factory also generates them: seeded random sequences of pointer
 * gestures (clicks, drags, header and corner clicks, with Shift or Command held or not), each
 * followed by a look at the selection. Each sequence is written as a case and recorded on Excel
 * twice; one whose recordings disagree is discarded. The same seed always gives the same cases,
 * so an exploration can be repeated and reviewed.
 */
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { HELD_KEYS, type ActionStep, type PointerTarget, type Step } from '../sheet/index.ts';
import { ok, PATHS, type Result, type Trace, validate, writeJsonFile } from '../kernel/index.ts';
import { CASE_FILES } from './repository.ts';
import { CASE_TAGS, exploreOptionsSchema, type Case } from './contract.ts';
import { recordCase } from './record.ts';

export const EXPLORE = {
  /** The area explored cases go in. */
  area: 'explore',
  /** Gestures aim at the top-left of a new sheet, well inside the window. */
  columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  rows: 12,
  /** How often a gesture holds a key. */
  holdChance: 0.35,
} as const;

/** A small, fast generator of numbers in [0, 1), the same for the same seed (mulberry32). */
export const seededRandom = (seed: number): (() => number) => {
  const state = { value: seed >>> 0 };
  return () => {
    state.value = (state.value + 0x6d_2b_79_f5) >>> 0;
    let t = state.value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const pick = <T>(random: () => number, items: readonly T[]): T => {
  const item = items[Math.floor(random() * items.length)];
  // Every list here is a fixed, non-empty table.
  if (item === undefined) throw new Error('Picked from an empty list.');
  return item;
};

const column = (random: () => number) => pick(random, EXPLORE.columns);
const row = (random: () => number) => 1 + Math.floor(random() * EXPLORE.rows);
const cell = (random: () => number) => `${column(random)}${row(random)}`;
const hold = (random: () => number) =>
  random() < EXPLORE.holdChance ? { hold: [pick(random, HELD_KEYS)] } : {};

/** One random gesture: what a person might do next with the mouse. */
const gesture = (random: () => number): ActionStep => {
  const header = (): PointerTarget => (random() < 0.5 ? column(random) : row(random));
  const choices: (() => ActionStep)[] = [
    () => ({ do: 'click', cell: cell(random), ...hold(random) }),
    () => ({ do: 'drag', from: cell(random), to: cell(random), ...hold(random) }),
    () => ({ do: 'drag', from: header(), to: cell(random), ...hold(random) }),
    () => ({ do: 'click-column', column: column(random), ...hold(random) }),
    () => ({ do: 'click-row', row: row(random), ...hold(random) }),
    () => ({ do: 'click-corner' }),
  ];
  return pick(random, choices)();
};

/** The case for one sequence: gestures, each followed by a look at the selection. */
export const exploredCase = (seed: number, index: number, length: number): Case => {
  const random = seededRandom(seed * 1_000 + index);
  const steps: Step[] = Array.from({ length }, () => [
    gesture(random),
    { do: 'observe-selection' } as const,
  ]).flat();
  return {
    description: `An explored sequence of ${length} random gestures (seed ${seed}, number ${index}); the recording says what Excel selected after each.`,
    tags: [CASE_TAGS.explored],
    steps,
  };
};

/** What one exploration found: the cases recorded, and the ones discarded as unstable. */
export interface Exploration {
  readonly recorded: readonly string[];
  readonly discarded: readonly string[];
}

/** Generates, writes and records each sequence, keeping only those Excel repeats exactly. */
export const exploreCases = async (
  request: Readonly<Record<string, unknown>>,
  trace: Trace,
): Promise<Result<Exploration>> => {
  const options = validate(exploreOptionsSchema, request, 'the explore options');
  if (!options.success) return options;
  const { seed, count, steps } = options.data;
  const found: { recorded: string[]; discarded: string[] } = { recorded: [], discarded: [] };
  for (let index = 1; index <= count; index += 1) {
    const id = `${EXPLORE.area}/seed-${seed}-${index}`;
    const file = join(PATHS.excelCases, ...id.split('/'), CASE_FILES.definition);
    // Each sequence drives the one browser session, so they run one at a time.
    // oxlint-disable-next-line no-await-in-loop
    const written = await writeJsonFile(file, exploredCase(seed, index, steps));
    if (!written.success) return written;
    // oxlint-disable-next-line no-await-in-loop
    const recording = await recordCase(id, trace);
    trace('case.explored', {
      id,
      recorded: recording.success,
      differences: recording.success ? [] : (recording.error.details ?? [recording.error.message]),
    });
    if (recording.success) found.recorded.push(id);
    else {
      found.discarded.push(id);
      // oxlint-disable-next-line no-await-in-loop
      await rm(dirname(file), { recursive: true, force: true });
    }
  }
  return ok(found);
};

export const renderExploration = ({ recorded, discarded }: Exploration): string =>
  [
    ...recorded.map((id) => `● ${id}`),
    ...discarded.map((id) => `✖ ${id}: the two recordings disagreed, so it was discarded`),
    `Recorded ${recorded.length} of ${recorded.length + discarded.length} explored sequences.`,
  ].join('\n');
