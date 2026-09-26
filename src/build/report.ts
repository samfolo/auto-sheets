/**
 * `factory build show`: one run at a glance. Whether it worked, how long it took, what it cost,
 * and how the score moved while the agent worked, read from the run's summary and its log.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Tally } from '../clone/index.ts';
import { attempt, fail, ok, PATHS, PROJECT, readJsonFile, type Result } from '../kernel/index.ts';
import { RUN_FILES } from './build.ts';
import { buildSummarySchema, scoreEventSchema, type BuildSummary } from './contract.ts';

const SECOND_MS = 1000;
const SECONDS_PER_MINUTE = 60;

/** One check the agent made: when, and how many cases passed. */
export interface ScorePoint extends Tally {
  /** Milliseconds after the run started. */
  readonly afterMs: number;
}

export interface RunReport {
  readonly summary: BuildSummary;
  readonly scores: readonly ScorePoint[];
}

/** Every run that has finished, oldest first, since runs are named after the time they started. */
const finishedRuns = async (): Promise<string[]> => {
  const runs = existsSync(PATHS.runs) ? await readdir(PATHS.runs) : [];
  return runs.filter((run) => existsSync(join(PATHS.runs, run, RUN_FILES.summary))).toSorted();
};

/** The newest run that has finished. */
const latestRun = async (): Promise<Result<string>> => {
  const latest = (await finishedRuns()).at(-1);
  return latest === undefined
    ? fail('FILE_UNREADABLE', 'No build has finished yet.', {
        hint: `Run \`${PROJECT.cli} build\` first.`,
      })
    : ok(latest);
};

/** The agent's scores from the run's log, in order. Lines that aren't scores are skipped. */
const readScores = async (runDir: string, startedAt: string): Promise<Result<ScorePoint[]>> => {
  const log = await attempt(
    () => readFile(join(runDir, RUN_FILES.log), 'utf8'),
    (reason) => fail('FILE_UNREADABLE', 'Could not read the run’s log.', { details: [reason] }),
  );
  if (!log.success) return log;
  const start = Date.parse(startedAt);
  return ok(
    log.data.split('\n').flatMap((line) => {
      if (!line.includes('"agent.score"')) return [];
      const event = scoreEventSchema.safeParse(JSON.parse(line));
      if (!event.success) return [];
      const { time, passed, total } = event.data;
      return [{ afterMs: Date.parse(time) - start, passed, total }];
    }),
  );
};

export const showRun = async (id: string | undefined): Promise<Result<RunReport>> => {
  const runId = id === undefined ? await latestRun() : ok(id);
  if (!runId.success) return runId;
  const runDir = join(PATHS.runs, runId.data);
  const summary = await readJsonFile(join(runDir, RUN_FILES.summary), buildSummarySchema);
  if (!summary.success) return summary;
  const scores = await readScores(runDir, summary.data.startedAt);
  if (!scores.success) return scores;
  return ok({ summary: summary.data, scores: scores.data });
};

/** A duration as minutes and seconds, such as 31:05. */
const clock = (ms: number): string => {
  const seconds = Math.round(ms / SECOND_MS);
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return `${minutes}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}`;
};

const OUTCOMES: Readonly<Record<BuildSummary['run']['outcome'], string>> = {
  finished: 'finished',
  timedOut: 'stopped at its time limit',
  failed: 'failed',
};

const tallied = ({ passed, total }: Tally): string => `${passed} of ${total}`;

export const renderRun = ({ summary, scores }: RunReport): string => {
  const { runId, agent, factory, run, check, startedAt, finishedAt } = summary;
  const took = Date.parse(finishedAt) - Date.parse(startedAt);
  const fullCheck = Math.max(0, ...scores.map(({ total }) => total));
  return [
    `Run ${runId}: ${agent.name} on ${agent.model}, from factory ${factory.version} at ${factory.commit?.slice(0, 7) ?? 'no commit'}.`,
    `Took ${clock(took)} in all. The agent ${OUTCOMES[run.outcome]}${run.error === null ? '' : ` (${run.error})`} after ${run.toolCalls} tool calls and ${run.tokens.toLocaleString('en-GB')} tokens, for about $${run.costUsd.toFixed(2)}.`,
    '',
    scores.length === 0
      ? 'The agent never checked its clone.'
      : 'Checks while it worked (● every visible case):',
    ...scores.map(
      (point) =>
        `  ${clock(point.afterMs).padStart(6)}  ${tallied(point)}${point.total === fullCheck ? ' ●' : ''}`,
    ),
    '',
    check.score === null
      ? `Final check: not run. ${check.problem}`
      : `Final check: ${tallied(check.score.seen)} seen, ${tallied(check.score.heldOut)} held-out and ${tallied(check.score.golden)} golden cases match Excel.`,
  ].join('\n');
};

/**
 * Every finished run whose summary meets the current contract, for comparing runs side by side.
 * Runs from before the contract are skipped rather than failing the list.
 */
export const listRuns = async (): Promise<Result<BuildSummary[]>> => {
  const summaries = await Promise.all(
    (await finishedRuns()).map((run) =>
      readJsonFile(join(PATHS.runs, run, RUN_FILES.summary), buildSummarySchema),
    ),
  );
  return ok(summaries.flatMap((summary) => (summary.success ? [summary.data] : [])));
};

const scoreColumn = ({ check }: BuildSummary): string =>
  check.score === null
    ? 'not checked'
    : `${tallied(check.score.seen)} seen, ${tallied(check.score.heldOut)} held out`;

export const renderRuns = (summaries: readonly BuildSummary[]): string =>
  summaries.length === 0
    ? 'No finished runs with a summary yet.'
    : summaries
        .map((summary) =>
          [
            summary.runId,
            summary.agent.model.padEnd(48),
            clock(Date.parse(summary.finishedAt) - Date.parse(summary.startedAt)).padStart(6),
            `$${summary.run.costUsd.toFixed(2)}`.padStart(6),
            OUTCOMES[summary.run.outcome].padEnd(26),
            scoreColumn(summary),
          ].join('  '),
        )
        .join('\n');
