/**
 * Exploring an interface nobody has listed. A person thinks of a fraction of the interactions a
 * product supports, so the factory also generates them: seeded random sequences of gestures or
 * entries, drawn by a focus (see `sequences.ts`), each followed by a look at the result. Each
 * sequence is written as a case and recorded on Excel twice; one whose recordings disagree is
 * discarded. The same seed always gives the same cases, so an exploration can be repeated and
 * reviewed, and a case already recorded is never touched.
 */
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  inOrder,
  ok,
  PATHS,
  type Result,
  seededRandom,
  type Trace,
  validate,
  writeJsonFile,
} from '../kernel/index.ts';
import { CASE_FILES } from './repository.ts';
import { CASE_TAGS, exploreOptionsSchema, type Case, type FocusName } from './contract.ts';
import { recordCase } from './record.ts';
import { FOCUSES } from './sequences.ts';

/** The area explored cases go in. */
const EXPLORE_AREA = 'explore';

/**
 * Where a sequence's randomness starts. `mixed` keeps the form it had before focuses existed,
 * so the cases it already produced can still be produced again.
 */
const seedOf = (focus: FocusName, seed: number, index: number): string =>
  focus === 'mixed'
    ? `${EXPLORE_AREA}:${seed}:${index}`
    : `${EXPLORE_AREA}:${focus}:${seed}:${index}`;

/** A sequence's case id, under the explore area. */
export const exploredId = (focus: FocusName, seed: number, index: number): string =>
  `${EXPLORE_AREA}/${focus === 'mixed' ? '' : `${focus}-`}seed-${seed}-${index}`;

/** The case for one sequence, drawn by its focus. */
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
  const ids = Array.from({ length: count }, (_, offset) => exploredId(focus, seed, offset + 1));
  // Each sequence drives the one browser session, so they run one at a time.
  const outcomes = await inOrder(ids, (id, offset) =>
    exploreOne(id, exploredCase(seed, offset + 1, steps, focus), trace),
  );
  if (!outcomes.success) return outcomes;
  const ended = (outcome: Outcome): string[] =>
    ids.filter((_, offset) => outcomes.data[offset] === outcome);
  return ok({ recorded: ended('recorded'), discarded: ended('discarded'), kept: ended('kept') });
};

export const renderExploration = ({ recorded, discarded, kept }: Exploration): string =>
  [
    ...recorded.map((id) => `● ${id}`),
    ...kept.map((id) => `○ ${id}: already recorded, left as it was`),
    ...discarded.map((id) => `✖ ${id}: the two recordings disagreed, so it was discarded`),
    `Recorded ${recorded.length} new sequences; ${discarded.length} discarded, ${kept.length} already there.`,
  ].join('\n');
