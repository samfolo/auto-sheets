/**
 * Runs an agent in a workspace through Pi's SDK, in the factory's own process. The factory
 * supplies every service Pi would otherwise read from its agent directory, so the agent has no
 * directory on disk and Pi discovers nothing on its own:
 *
 * - the model, with its key held in memory, never in a file or an environment variable;
 * - the definition's system prompt, its context as Pi's context files, and its task; no
 *   extensions, skills, prompt templates or themes;
 * - exactly the tools the definition lists, with the factory's harness tools in place of Pi's
 *   where they differ;
 * - in-memory settings, and a session kept in the run's folder, where the full transcript lives.
 *
 * The factory traces each tool call and reply, and stops the agent when its time is up.
 */
import {
  type AgentSession,
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { join } from 'node:path';
import type { RecordedCase } from '../cases/index.ts';
import { attempt, fail, NO_TRACE, ok, type Result, type Trace } from '../kernel/index.ts';
import type { AgentRun, AgentSettings, AgentToolName } from './contract.ts';
import type { AgentDefinition } from './definition.ts';
import {
  type CaseChecker,
  createBashTool,
  createCaseChecker,
  createCheckCasesTool,
  createFileTools,
  createTryStepsTool,
} from './tools/index.ts';

/** Where Pi keeps the agent's session, inside the run's folder. */
const SESSIONS_FOLDER = 'sessions';

const MINUTE_MS = 60_000;

/**
 * How often the agent is told how much time it has left. Models misjudge their own clocks: one
 * decided time was nearly out a third of the way through its budget.
 */
const TIME_REMINDER_MS = 15 * MINUTE_MS;

/**
 * Pi's settings for every session. Retries back off for about five minutes in all, because a
 * free model's shared rate limit clears in minutes, while Pi's defaults give up in seconds.
 */
const PI_SETTINGS = {
  enableInstallTelemetry: false,
  retry: { enabled: true, maxRetries: 8, baseDelayMs: 5_000, maxAgentDelayMs: MINUTE_MS },
} as const;

/** How often a reply still being written reports its progress, so a long reply isn't mistaken for a hang. */
const HEARTBEAT_MS = 30_000;

/** The parts of a reply that stream in, by the delta event that carries each. */
const STREAMED_PARTS = {
  thinking_delta: 'thinking',
  text_delta: 'text',
  toolcall_delta: 'toolCall',
} as const;

type StreamedPart = (typeof STREAMED_PARTS)[keyof typeof STREAMED_PARTS];

/**
 * Traces a reply's progress while it streams: how many characters of thinking, text and tool
 * calls have arrived, at most once per heartbeat. Raw deltas are never logged; they would repeat
 * the whole reply many times over.
 */
const createHeartbeat = (trace: Trace) => {
  const reply = { started: 0, lastBeat: 0, chars: { thinking: 0, text: 0, toolCall: 0 } };
  return {
    start: (): void => {
      reply.started = performance.now();
      reply.lastBeat = reply.started;
      reply.chars = { thinking: 0, text: 0, toolCall: 0 };
    },
    grow: (part: StreamedPart, delta: string): void => {
      reply.chars[part] += delta.length;
      const now = performance.now();
      if (now - reply.lastBeat < HEARTBEAT_MS) return;
      reply.lastBeat = now;
      trace('agent.streaming', {
        seconds: Math.round((now - reply.started) / 1000),
        ...reply.chars,
      });
    },
  };
};

/** Where an agent works: its workspace, and the run's folder for its session and the tools' logs. */
export interface AgentPlace {
  readonly workspace: string;
  readonly runDir: string;
}

export interface AgentOptions extends AgentPlace {
  readonly apiKey: string;
  readonly minutes: number;
  /** The cases the agent may check against, as they were when the run started. */
  readonly cases: readonly RecordedCase[];
  /** A spending limit in dollars, or null for none. */
  readonly maxUsd: number | null;
}

/** What an agent is given, exactly as Pi will send it. */
export interface AgentBriefing {
  readonly model: string;
  readonly thinking: string;
  readonly tools: readonly string[];
  readonly systemPrompt: string;
  readonly task: string;
}

/** Only what the definition supplies: Pi discovers nothing from disk. */
const resourcesFor = (definition: AgentDefinition): ResourceLoader => ({
  getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
  getSkills: () => ({ skills: [], diagnostics: [] }),
  getPrompts: () => ({ prompts: [], diagnostics: [] }),
  getThemes: () => ({ themes: [], diagnostics: [] }),
  getAgentsFiles: () => ({ agentsFiles: [...definition.context] }),
  getSystemPrompt: () => definition.systemPrompt,
  getSystemPromptSource: () => undefined,
  getAppendSystemPrompt: () => [],
  getAppendSystemPromptSources: () => [],
  extendResources: () => undefined,
  reload: async () => undefined,
});

/**
 * The factory's tools, by the name the definition uses: its own harness tools, and Pi's built-in
 * tools confined to the workspace in place of the originals.
 */
const harnessTools = (
  { workspace, runDir }: AgentPlace,
  checker: CaseChecker,
  trace: Trace,
): Partial<Record<AgentToolName, ToolDefinition>> => ({
  ...createFileTools(workspace),
  bash: createBashTool(workspace),
  check_cases: createCheckCasesTool(checker),
  try_steps: createTryStepsTool(workspace, runDir, trace),
});

/**
 * Pi's model runtime with the key held in memory, and the model the settings name. Nothing is
 * read from disk and nothing calls the model. A model too new for Pi's catalogue is described
 * like the provider's other models (the same endpoint and API) under its own id, with no known
 * price; `listed` says which it was.
 */
export const openModel = async ({ provider, id }: AgentSettings['model'], apiKey: string) => {
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
  });
  await modelRuntime.setRuntimeApiKey(provider, apiKey);
  const listed = modelRuntime.getModel(provider, id);
  if (listed !== undefined) return ok({ modelRuntime, model: listed, listed: true });
  const sibling = modelRuntime.getModels(provider)[0];
  if (sibling === undefined) {
    return fail('ENVIRONMENT_NOT_READY', `Pi knows no provider called ${provider}.`, {
      hint: 'Check the model in the agent’s agent.json, or the --model option.',
    });
  }
  const unpriced = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  return ok({
    modelRuntime,
    model: { ...sibling, id, name: id, cost: unpriced },
    listed: false,
  });
};

/** A Pi session for the agent, given only what its definition says. */
const openSession = async (
  definition: AgentDefinition,
  place: AgentPlace,
  apiKey: string,
  sessionManager: SessionManager,
  checker: CaseChecker,
  trace: Trace,
) => {
  const opened = await openModel(definition.settings.model, apiKey);
  if (!opened.success) return opened;
  if (!opened.data.listed) trace('agent.model.unlisted', { model: opened.data.model.id });
  const tools = harnessTools(place, checker, trace);
  const { session } = await createAgentSession({
    cwd: place.workspace,
    model: opened.data.model,
    thinkingLevel: definition.settings.model.thinking,
    modelRuntime: opened.data.modelRuntime,
    resourceLoader: resourcesFor(definition),
    settingsManager: SettingsManager.inMemory(PI_SETTINGS),
    sessionManager,
    tools: [...definition.settings.tools],
    customTools: definition.settings.tools.flatMap((name) => tools[name] ?? []),
  });
  return ok(session);
};

/**
 * What the agent would be given in a workspace: its model, tools, task and the whole system
 * prompt as Pi assembles it. Nothing calls the model, so it's safe to run before any build.
 */
export const briefAgent = async (
  definition: AgentDefinition,
  place: AgentPlace,
  apiKey: string,
): Promise<Result<AgentBriefing>> => {
  const session = await openSession(
    definition,
    place,
    apiKey,
    SessionManager.inMemory(place.workspace),
    createCaseChecker(place.workspace, place.runDir, [], NO_TRACE),
    NO_TRACE,
  );
  if (!session.success) return session;
  const briefing = {
    model: `${session.data.model?.provider}/${session.data.model?.id}`,
    thinking: session.data.thinkingLevel,
    tools: session.data.getActiveToolNames(),
    systemPrompt: session.data.systemPrompt,
    task: definition.task,
  };
  session.data.dispose();
  return ok(briefing);
};

/** What the agent is told about its time, a definite fact the harness knows and it doesn't. */
const timeLeft = (minutes: number): string =>
  `You have about ${Math.max(0, Math.round(minutes))} minutes left. You will be stopped when they are up, so keep the app working and committed as you go.`;

/** What the agent is told when it stops before its app is done. */
const NOT_DONE =
  'You stopped, but you are not done: you are done when every case passes and `npm run check` is clean. Here is where your app stands.';

/**
 * How many times the harness sends the agent back to work after it stops early. It bounds a
 * model that keeps stopping without progress.
 */
const MAX_FOLLOW_UPS = 5;

/** Traces what the session does: tools, replies, retries, compactions and a streaming heartbeat. */
/** What a run has come to: whether it was stopped, and the latest reply's error. */
interface RunState {
  timedOut: boolean;
  overBudget: boolean;
  error: string | null;
}

const traceSession = (
  session: AgentSession,
  trace: Trace,
  state: RunState,
  maxUsd: number | null,
) => {
  const heartbeat = createHeartbeat(trace);
  session.subscribe((event) => {
    if (event.type === 'message_start' && event.message.role === 'assistant') heartbeat.start();
    if (event.type === 'message_update' && 'delta' in event.assistantMessageEvent) {
      const { type, delta } = event.assistantMessageEvent;
      heartbeat.grow(STREAMED_PARTS[type], delta);
    }
    if (event.type === 'auto_retry_start') {
      trace('agent.retry', {
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        reason: event.errorMessage,
      });
    }
    if (event.type === 'auto_retry_end' && !event.success) {
      trace('agent.retry.failed', { attempt: event.attempt, reason: event.finalError });
    }
    if (event.type === 'compaction_start') trace('agent.compaction', { reason: event.reason });
    if (event.type === 'tool_execution_start') trace('agent.tool', { tool: event.toolName });
    if (event.type === 'tool_execution_end' && event.isError) {
      trace('agent.tool.error', { tool: event.toolName });
    }
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const { stopReason, errorMessage, usage } = event.message;
      trace('agent.reply', { stopReason, tokens: usage.totalTokens, costUsd: usage.cost.total });
      // Only the latest reply counts: a failed reply that Pi then retries successfully is
      // not the run's error.
      state.error = stopReason === 'error' ? (errorMessage ?? 'The model call failed.') : null;
      const spent = session.getSessionStats().cost;
      if (maxUsd !== null && spent >= maxUsd && !state.overBudget) {
        state.overBudget = true;
        trace('agent.over-budget', { spentUsd: spent, maxUsd });
        void session.abort();
      }
    }
  });
};

/** Why the run ended: a limit it reached, or else whether its last reply failed. */
const outcomeOf = (state: RunState, error: string | null): AgentRun['outcome'] => {
  if (state.timedOut) return 'timedOut';
  if (state.overBudget) return 'overBudget';
  return error === null ? 'finished' : 'failed';
};

/**
 * Runs the agent until it is done or out of time. The model decides when it has stopped, but
 * not whether it is done: that is definite, so the harness checks it. If the agent stops early,
 * it is sent back with the scoreboard and the time it has left.
 */
export const runAgent = async (
  definition: AgentDefinition,
  options: AgentOptions,
  trace: Trace,
): Promise<Result<AgentRun>> => {
  const checker = createCaseChecker(options.workspace, options.runDir, options.cases, trace);
  const opened = await openSession(
    definition,
    options,
    options.apiKey,
    SessionManager.create(options.workspace, join(options.runDir, SESSIONS_FOLDER)),
    checker,
    trace,
  );
  if (!opened.success) return opened;
  const session = opened.data;
  const state: RunState = { timedOut: false, overBudget: false, error: null };
  traceSession(session, trace, state, options.maxUsd);
  const deadline = performance.now() + options.minutes * MINUTE_MS;
  const minutesLeft = () => (deadline - performance.now()) / MINUTE_MS;
  const timer = setTimeout(() => {
    state.timedOut = true;
    void session.abort();
  }, options.minutes * MINUTE_MS);
  // Delivered between turns, so it never interrupts a reply or a tool.
  const reminder = setInterval(() => {
    if (!session.isStreaming) return;
    session.steer(timeLeft(minutesLeft())).catch((error: unknown) => {
      trace('agent.reminder.failed', { reason: String(error) });
    });
  }, TIME_REMINDER_MS);

  const work = async (prompt: string, followUps: number): Promise<Result<void>> => {
    const prompted = await attempt(
      () =>
        session.prompt(`${prompt}\n\n${timeLeft(minutesLeft())}`, { expandPromptTemplates: false }),
      (reason) => fail('INTERNAL', `The agent stopped unexpectedly: ${reason}`),
    );
    if (!prompted.success || state.timedOut || state.overBudget || state.error !== null) {
      return prompted;
    }
    if (followUps >= MAX_FOLLOW_UPS) return prompted;
    const outcome = await checker.check([]);
    if (outcome.complete || state.timedOut) return prompted;
    trace('agent.continue', { followUp: followUps + 1, minutesLeft: Math.round(minutesLeft()) });
    return work(`${NOT_DONE}\n\n${outcome.text}`, followUps + 1);
  };
  const worked = await work(definition.task, 0);
  clearTimeout(timer);
  clearInterval(reminder);
  const stats = session.getSessionStats();
  session.dispose();
  const error = worked.success ? state.error : worked.error.message;
  return ok({
    outcome: outcomeOf(state, error),
    error,
    toolCalls: stats.toolCalls,
    replies: stats.assistantMessages,
    tokens: stats.tokens.total,
    costUsd: stats.cost,
  });
};
