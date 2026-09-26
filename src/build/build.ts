/**
 * `factory build`: one attempt by an agent to build a clone from scratch, and the factory's own
 * verdict on it. The run gets an id, which is its start time, and a folder under artifacts/runs/
 * for its log, the agent's session and the summary. The workspace is created outside the
 * factory, named by the same id unless another directory is given. The agent works until it
 * stops or runs out of time; then the factory starts the clone itself and runs every recorded
 * case on it, including the held-out cases the agent never saw. The summary records the factory
 * version and the agent's model, so runs can be compared as either changes.
 */
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { type AgentDefinition, loadAgentDefinition, OUTCOMES, runAgent } from '../agent/index.ts';
import { CASE_TAGS, type RecordedCase, selectCases } from '../cases/index.ts';
import { checkClone, scoreClone, type Tally } from '../clone/index.ts';
import {
  displayPath,
  fail,
  ok,
  openTelemetry,
  PATHS,
  readCredentials,
  readStamp,
  SANDBOX_EXEC,
  sandboxAvailable,
  type Result,
  type Trace,
  validate,
  writeJsonFile,
} from '../kernel/index.ts';
import { buildOptionsSchema, type BuildSummary, type FinalCheck } from './contract.ts';
import { bestCheckpoint, prepareWorkspace, restoreCheckpoint } from './workspace.ts';

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

/**
 * The final check, of whatever the agent built at its best. An agent can break its app after its
 * best check and run out of time before noticing, so if the final state scores below the best
 * checkpoint, the checkpoint is restored and checked instead, and both scores are kept.
 */
const keepTheBest = async (
  workspace: string,
  runDir: string,
  cases: readonly RecordedCase[],
  trace: Trace,
): Promise<FinalCheck> => {
  const final = await finalCheck(workspace, runDir, cases, trace);
  const best = bestCheckpoint(workspace);
  if (best === null || (final.score?.seen.passed ?? -1) >= best.passed) return final;
  trace('build.restore', { checkpoint: best.commit, passed: best.passed, final: final.score });
  if (!restoreCheckpoint(workspace, best)) return final;
  const restored = await finalCheck(workspace, runDir, cases, trace);
  return { ...restored, restored: { checkpoint: best.commit, finalScore: final.score } };
};

/** The definition with its model replaced for one build, given as provider/id. */
const withModel = (definition: AgentDefinition, model: string | undefined): AgentDefinition => {
  if (model === undefined) return definition;
  const [provider = '', ...id] = model.split('/');
  const { settings } = definition;
  return {
    ...definition,
    settings: { ...settings, model: { ...settings.model, provider, id: id.join('/') } },
  };
};

/** Random hex characters that keep runs started in the same millisecond apart. */
const RUN_ID_SUFFIX_BYTES = 2;

/**
 * A run's id: when it started, in a form that sorts and is safe in a path, then a short random
 * suffix, because parallel builds can start in the same millisecond.
 */
const newRunId = (): string =>
  `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomBytes(RUN_ID_SUFFIX_BYTES).toString('hex')}`;

const finalCheck = async (
  workspace: string,
  runDir: string,
  cases: readonly RecordedCase[],
  trace: Trace,
): Promise<FinalCheck> => {
  const verdicts = await checkClone(
    workspace,
    {
      cases,
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
  const loaded = await loadAgentDefinition(options.data.agent);
  if (!loaded.success) return loaded;
  const definition = withModel(loaded.data, options.data.model);
  const credentials = readCredentials();
  if (!credentials.success) return credentials;
  if (!sandboxAvailable()) {
    return fail('ENVIRONMENT_NOT_READY', 'Builds need a sandbox to confine their agent.', {
      details: [`${SANDBOX_EXEC} is missing: it comes with macOS.`],
      hint: 'Run builds on macOS. Linux needs another sandbox first, such as bubblewrap.',
    });
  }

  // The cases, and what Excel did in each, are fixed now: anything recorded while the agent
  // works belongs to later builds.
  const cases = await selectCases({ ids: [] });
  if (!cases.success) return cases;
  const visible = cases.data.filter(
    (recorded) => !recorded.definition.tags.includes(CASE_TAGS.heldOut),
  );
  const runId = newRunId();
  const workspace = await prepareWorkspace(options.data.out ?? join(PATHS.builds, runId), visible);
  if (!workspace.success) return workspace;
  const runDir = join(PATHS.runs, runId);
  const runTrace = openTelemetry({ logFile: join(runDir, RUN_FILES.log), runId }).trace;
  const { name, settings } = definition;
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
    definition,
    {
      workspace: workspace.data,
      runDir,
      apiKey: credentials.data.openRouterApiKey,
      minutes,
      maxUsd: options.data.maxUsd ?? null,
      cases: visible,
    },
    runTrace,
  );
  if (!run.success) return run;
  trace('build.agent', { runId, ...run.data });
  const check = await keepTheBest(workspace.data, runDir, cases.data, runTrace);

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

export const renderBuild = ({ runId, workspace, agent, run, check }: BuildSummary): string =>
  [
    `Run ${runId}`,
    `Workspace: ${workspace}`,
    `Agent: ${agent.name} on ${agent.model} ${OUTCOMES[run.outcome]}${run.error === null ? '' : ` (${run.error})`} after ${run.toolCalls} tool calls and ${run.replies} replies, for about $${run.costUsd.toFixed(2)}.`,
    check.score === null
      ? `Clone: not checked. ${check.problem}`
      : `Clone: ${formatTally(check.score.seen)} seen cases, ${formatTally(check.score.heldOut)} held-out cases and ${formatTally(check.score.golden)} golden cases match Excel.`,
    ...(check.restored === undefined
      ? []
      : [
          `Restored the checkpoint ${check.restored.checkpoint.slice(0, 7)}: the final state scored ${check.restored.finalScore === null ? 'nothing' : formatTally(check.restored.finalScore.seen)} seen cases.`,
        ]),
    `Details: ${displayPath(join(PATHS.runs, runId, RUN_FILES.summary))}`,
  ].join('\n');
