/**
 * `factory build`: one attempt by the agent to build a clone from scratch, and the factory's own
 * verdict on it. The run gets an id and a folder under artifacts/runs/; the workspace is created
 * outside the factory; the agent works in it until it stops or runs out of time; and then the
 * factory starts the clone itself and runs every recorded case against it. The summary records
 * which factory version produced the run, so runs can be compared as the factory improves.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { judgeClone, type Verdict } from '../cases/judge.ts';
import { buildOptionsSchema } from '../contracts/build.ts';
import { childEnvironment, readCredentials } from '../contracts/environment.ts';
import { validate } from '../contracts/validate.ts';
import { PATHS } from '../core/project.ts';
import { ok, type Result } from '../core/result.ts';
import { readStamp, type FactoryStamp } from '../core/stamp.ts';
import type { Trace } from '../core/telemetry.ts';
import { AGENT, runAgent, type AgentRun } from './agent.ts';
import { prepareWorkspace } from './workspace.ts';

export const BUILD = {
  /** Where the factory runs the finished clone for the final check, away from the agent's port. */
  verifyPort: 4399,
  /** How long the finished clone has to answer its health check. */
  startupMs: 60_000,
  pollMs: 500,
} as const;

/** The factory's check of the finished clone. */
export interface FinalCheck {
  readonly passed: number;
  readonly failed: number;
  readonly verdicts: readonly Verdict[];
  /** Why the check couldn't run, such as the clone not starting. */
  readonly problem: string | null;
}

export interface BuildSummary {
  readonly runId: string;
  readonly factory: FactoryStamp;
  readonly model: string;
  readonly workspace: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly agent: AgentRun;
  readonly check: FinalCheck;
}

const newRunId = (): string => new Date().toISOString().replaceAll(/[:.]/g, '-');

const waitForHealth = async (url: string, deadline: number): Promise<boolean> => {
  const healthy = await fetch(new URL('/api/health', url)).then(
    (response) => response.ok,
    () => false,
  );
  if (healthy || performance.now() >= deadline) return healthy;
  await sleep(BUILD.pollMs);
  return waitForHealth(url, deadline);
};

const stop = (app: ChildProcess): void => {
  if (app.pid !== undefined && app.exitCode === null) process.kill(-app.pid, 'SIGTERM');
};

/** A final check that couldn't run, and why. */
const uncheckable = (problem: string): FinalCheck => ({
  passed: 0,
  failed: 0,
  verdicts: [],
  problem,
});

/** Starts the finished clone with `npm start`, runs every recorded case on it, and stops it. */
const checkClone = async (workspace: string, runDir: string, trace: Trace): Promise<FinalCheck> => {
  if (!existsSync(join(workspace, 'package.json')))
    return uncheckable('The workspace has no package.json.');
  const url = `http://localhost:${BUILD.verifyPort}`;
  const log = join(runDir, 'app.log');
  const app = spawn('npm', ['start'], {
    cwd: workspace,
    env: { ...childEnvironment(), PORT: String(BUILD.verifyPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const output: Promise<void>[] = [];
  const keep = (chunk: Buffer) => output.push(writeFile(log, chunk, { flag: 'a' }));
  app.stdout.on('data', keep);
  app.stderr.on('data', keep);
  try {
    if (!(await waitForHealth(url, performance.now() + BUILD.startupMs))) {
      return uncheckable(`The clone did not answer at ${url} within a minute; see ${log}.`);
    }
    const verdicts = await judgeClone({ url, ids: [], headed: false }, trace);
    if (!verdicts.success) return uncheckable(verdicts.error.message);
    const passed = verdicts.data.filter((verdict) => verdict.passed).length;
    return {
      passed,
      failed: verdicts.data.length - passed,
      verdicts: verdicts.data,
      problem: null,
    };
  } finally {
    stop(app);
    await Promise.all(output);
  }
};

export const build = async (
  request: Readonly<Record<string, unknown>>,
  trace: Trace,
): Promise<Result<BuildSummary>> => {
  const options = validate(buildOptionsSchema, request, 'the build options');
  if (!options.success) return options;
  const { out, minutes } = options.data;
  const credentials = readCredentials();
  if (!credentials.success) return credentials;
  const workspace = await prepareWorkspace(out);
  if (!workspace.success) return workspace;

  const runId = newRunId();
  const runDir = join(PATHS.runs, runId);
  await mkdir(runDir, { recursive: true });
  const startedAt = new Date().toISOString();
  trace('build.start', { runId, workspace: workspace.data, model: AGENT.model, minutes });

  const agent = await runAgent(
    {
      workspace: workspace.data,
      runDir,
      runId,
      logFile: join(runDir, 'events.jsonl'),
      apiKey: credentials.data.openRouterApiKey,
      minutes,
    },
    trace,
  );
  trace('build.agent', { runId, ...agent });
  const check = await checkClone(workspace.data, runDir, trace);

  const summary: BuildSummary = {
    runId,
    factory: readStamp(),
    model: AGENT.model,
    workspace: workspace.data,
    startedAt,
    finishedAt: new Date().toISOString(),
    agent,
    check,
  };
  await writeFile(join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  trace('build.end', { runId, passed: check.passed, failed: check.failed, problem: check.problem });
  return ok(summary);
};

export const renderBuild = ({ runId, workspace, agent, check }: BuildSummary): string =>
  [
    `Run ${runId}: workspace ${workspace}`,
    `Agent: ${agent.toolCalls} tool calls, ${agent.replies} replies, about $${agent.estimatedCostUsd.toFixed(2)}${agent.timedOut ? ', stopped at the time limit' : ''}.`,
    check.problem === null
      ? `Clone: ${check.passed} of ${check.passed + check.failed} cases match Excel.`
      : `Clone: not checked. ${check.problem}`,
  ].join('\n');
