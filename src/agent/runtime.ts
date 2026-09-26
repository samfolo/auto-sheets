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
import { attempt, fail, NO_TRACE, ok, type Result, type Trace } from '../kernel/index.ts';
import type { AgentRun, AgentSettings, AgentToolName } from './contract.ts';
import type { AgentDefinition } from './definition.ts';
import { createBashTool, createCheckCasesTool } from './tools/index.ts';

/** Where Pi keeps the agent's session, inside the run's folder. */
const SESSIONS_FOLDER = 'sessions';

const MINUTE_MS = 60_000;

/** Where an agent works: its workspace, and the run's folder for its session and the tools' logs. */
export interface AgentPlace {
  readonly workspace: string;
  readonly runDir: string;
}

export interface AgentOptions extends AgentPlace {
  readonly apiKey: string;
  readonly minutes: number;
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

/** The factory's tools, by the name the definition uses. Other names are Pi's built-in tools. */
const harnessTools = (
  { workspace, runDir }: AgentPlace,
  trace: Trace,
): Partial<Record<AgentToolName, ToolDefinition>> => ({
  bash: createBashTool(workspace),
  check_cases: createCheckCasesTool(workspace, runDir, trace),
});

/**
 * Pi's model runtime with the key held in memory, and the model the settings name. Nothing is
 * read from disk and nothing calls the model.
 */
export const openModel = async ({ provider, id }: AgentSettings['model'], apiKey: string) => {
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
  });
  await modelRuntime.setRuntimeApiKey(provider, apiKey);
  const model = modelRuntime.getModel(provider, id);
  if (model === undefined) {
    return fail('ENVIRONMENT_NOT_READY', `Pi's catalogue has no model ${provider}/${id}.`, {
      hint: 'Check the model in the agent’s agent.json.',
    });
  }
  return ok({ modelRuntime, model });
};

/** A Pi session for the agent, given only what its definition says. */
const openSession = async (
  definition: AgentDefinition,
  place: AgentPlace,
  apiKey: string,
  sessionManager: SessionManager,
  trace: Trace,
) => {
  const opened = await openModel(definition.settings.model, apiKey);
  if (!opened.success) return opened;
  const tools = harnessTools(place, trace);
  const { session } = await createAgentSession({
    cwd: place.workspace,
    model: opened.data.model,
    thinkingLevel: definition.settings.model.thinking,
    modelRuntime: opened.data.modelRuntime,
    resourceLoader: resourcesFor(definition),
    settingsManager: SettingsManager.inMemory({ enableInstallTelemetry: false }),
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

export const runAgent = async (
  definition: AgentDefinition,
  options: AgentOptions,
  trace: Trace,
): Promise<Result<AgentRun>> => {
  const opened = await openSession(
    definition,
    options,
    options.apiKey,
    SessionManager.create(options.workspace, join(options.runDir, SESSIONS_FOLDER)),
    trace,
  );
  if (!opened.success) return opened;
  const session = opened.data;

  const state = { timedOut: false, error: null as string | null };
  session.subscribe((event) => {
    if (event.type === 'tool_execution_start') trace('agent.tool', { tool: event.toolName });
    if (event.type === 'tool_execution_end' && event.isError) {
      trace('agent.tool.error', { tool: event.toolName });
    }
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const { stopReason, errorMessage, usage } = event.message;
      trace('agent.reply', { stopReason, tokens: usage.totalTokens, costUsd: usage.cost.total });
      if (stopReason === 'error') state.error = errorMessage ?? 'The model call failed.';
    }
  });
  const timer = setTimeout(() => {
    state.timedOut = true;
    void session.abort();
  }, options.minutes * MINUTE_MS);
  const prompted = await attempt(
    () => session.prompt(definition.task, { expandPromptTemplates: false }),
    (reason) => fail('INTERNAL', `The agent stopped unexpectedly: ${reason}`),
  );
  clearTimeout(timer);
  const stats = session.getSessionStats();
  session.dispose();
  const error = prompted.success ? state.error : prompted.error.message;
  return ok({
    outcome: state.timedOut ? 'timedOut' : error === null ? 'finished' : 'failed',
    error,
    toolCalls: stats.toolCalls,
    replies: stats.assistantMessages,
    tokens: stats.tokens.total,
    costUsd: stats.cost,
  });
};
