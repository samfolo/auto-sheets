/**
 * `factory build`: one attempt by an agent to build a clone from scratch, and the factory's own
 * verdict on it. The run gets an id, which is its start time, and a folder under artifacts/runs/
 * for its log, the agent's session and the summary. The workspace is created outside the
 * factory, named by the same id unless another directory is given. The agent works until it
 * stops or runs out of time; then the factory starts the clone itself and runs every recorded
 * case on it, including the held-out cases the agent never saw. The summary records the factory
 * version and the agent's model, so runs can be compared as either changes.
 */
import { join } from 'node:path';
import { loadAgentDefinition, runAgent, type AgentRun } from '../agent/index.ts';
import { checkClone, scoreClone, type Tally } from '../clone/index.ts';
import {
  displayPath,
  ok,
  openTelemetry,
  PATHS,
  readCredentials,
  readStamp,
  type Result,
  type Trace,
  validate,
  writeJsonFile,
} from '../kernel/index.ts';
import { buildOptionsSchema, type BuildSummary, type FinalCheck } from './contract.ts';
import { prepareWorkspace } from './workspace.ts';

/** What each run's folder holds. */
export const RUN_FILES = {
  /** Every event from the run: the agent's tool calls, its scores, and the driver's actions. */
  log: 'events.jsonl',
  /** The clone's output during the final check. */
  appLog: 'app.log',
  /** A picture of the clone at the end of each case, to compare with Excel by eye. */
  screenshots: 'screenshots',
  summary: 'summary.json',
} as const;

/** A run's id: when it started, in a form that sorts and is safe in a path. */
const newRunId = (): string => new Date().toISOString().replaceAll(/[:.]/g, '-');

const finalCheck = async (workspace: string, runDir: string, trace: Trace): Promise<FinalCheck> => {
  const verdicts = await checkClone(
    workspace,
    {
      ids: [],
      logFile: join(runDir, RUN_FILES.appLog),
      screenshots: join(runDir, RUN_FILES.screenshots),
    },
    trace,
  );
  if (!verdicts.success) return { score: null, verdicts: [], problem: verdicts.error.message };
  return { score: scoreClone(verdicts.data), verdicts: verdicts.data, problem: null };
};

export const build = async (
  request: Readonly<Record<string, unknown>>,
  trace: Trace,
): Promise<Result<BuildSummary>> => {
  const options = validate(buildOptionsSchema, request, 'the build options');
  if (!options.success) return options;
  const definition = await loadAgentDefinition(options.data.agent);
  if (!definition.success) return definition;
  const credentials = readCredentials();
  if (!credentials.success) return credentials;

  const runId = newRunId();
  const workspace = await prepareWorkspace(options.data.out ?? join(PATHS.builds, runId));
  if (!workspace.success) return workspace;
  const runDir = join(PATHS.runs, runId);
  const runTrace = openTelemetry({ logFile: join(runDir, RUN_FILES.log), runId }).trace;
  const { name, settings } = definition.data;
  const agent = {
    name,
    model: `${settings.model.provider}/${settings.model.id}`,
    thinking: settings.model.thinking,
  };
  const minutes = options.data.minutes ?? settings.budgetMinutes;
  // Stamped at the start: the factory may change while the agent works.
  const factory = readStamp();
  const startedAt = new Date().toISOString();
  trace('build.start', { runId, workspace: workspace.data, ...agent, minutes });

  const run = await runAgent(
    definition.data,
    { workspace: workspace.data, runDir, apiKey: credentials.data.openRouterApiKey, minutes },
    runTrace,
  );
  if (!run.success) return run;
  trace('build.agent', { runId, ...run.data });
  const check = await finalCheck(workspace.data, runDir, runTrace);

  const summary: BuildSummary = {
    runId,
    factory,
    agent,
    workspace: workspace.data,
    startedAt,
    finishedAt: new Date().toISOString(),
    run: run.data,
    check,
  };
  const written = await writeJsonFile(join(runDir, RUN_FILES.summary), summary);
  if (!written.success) return written;
  trace('build.end', { runId, score: check.score, problem: check.problem });
  return ok(summary);
};

const formatTally = ({ passed, total }: Tally): string => `${passed} of ${total}`;

const OUTCOMES: Readonly<Record<AgentRun['outcome'], string>> = {
  finished: 'finished',
  timedOut: 'stopped at its time limit',
  failed: 'failed',
};

export const renderBuild = ({ runId, workspace, agent, run, check }: BuildSummary): string =>
  [
    `Run ${runId}`,
    `Workspace: ${workspace}`,
    `Agent: ${agent.name} on ${agent.model} ${OUTCOMES[run.outcome]}${run.error === null ? '' : ` (${run.error})`} after ${run.toolCalls} tool calls and ${run.replies} replies, for about $${run.costUsd.toFixed(2)}.`,
    check.score === null
      ? `Clone: not checked. ${check.problem}`
      : `Clone: ${formatTally(check.score.seen)} seen cases, ${formatTally(check.score.heldOut)} held-out cases and ${formatTally(check.score.golden)} golden cases match Excel.`,
    `Details: ${displayPath(join(PATHS.runs, runId, RUN_FILES.summary))}`,
  ].join('\n');
