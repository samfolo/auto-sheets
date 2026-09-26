/**
 * An agent is defined by files in `agents/<name>/`, so its instructions can be read and reviewed
 * like any other document:
 *
 * - `agent.json`: its model, tools, context and time budget, checked against the contract;
 * - `system.md`: its role and how it works, which is its system prompt;
 * - `task.md`: what it is asked to do.
 *
 * Three kinds of instruction are kept apart. Who the agent is and how it works is its system
 * prompt. What applies to any job it does, such as the factory's standards, is the context its
 * settings list: loaded from the factory and given to Pi as context files, so several agents can
 * share one copy and none can edit it. What this job is about, such as the target's spec, is in
 * the workspace, and the task points to it.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  attempt,
  displayPath,
  fail,
  ok,
  PATHS,
  readJsonFile,
  type Result,
} from '../kernel/index.ts';
import { agentSettingsSchema, type AgentSettings } from './contract.ts';

export const AGENT_FILES = {
  settings: 'agent.json',
  system: 'system.md',
  task: 'task.md',
} as const;

/** The agent that builds clones, unless a build names another. */
export const DEFAULT_AGENT = 'builder';

/** How a context file is labelled for the agent: a factory document, not a workspace file. */
const CONTEXT_LABEL = (path: string): string => `factory:${path}`;

/** A document given to the agent as context, as Pi takes it. */
export interface ContextFile {
  readonly path: string;
  readonly content: string;
}

export interface AgentDefinition {
  readonly name: string;
  readonly settings: AgentSettings;
  readonly systemPrompt: string;
  readonly context: readonly ContextFile[];
  readonly task: string;
}

const readText = (file: string): Promise<Result<string>> =>
  attempt(
    async () => (await readFile(file, 'utf8')).trim(),
    (reason) =>
      fail('FILE_UNREADABLE', `Could not read ${displayPath(file)}.`, { details: [reason] }),
  );

const readContext = async (paths: readonly string[]): Promise<Result<ContextFile[]>> => {
  const files: ContextFile[] = [];
  for (const path of paths) {
    // Read in order, so the first missing document is the one reported.
    // oxlint-disable-next-line no-await-in-loop
    const content = await readText(join(PATHS.root, path));
    if (!content.success) return content;
    files.push({ path: CONTEXT_LABEL(path), content: content.data });
  }
  return ok(files);
};

/** Reads an agent's definition from `agents/<name>/`, with the context it carries. */
export const loadAgentDefinition = async (name: string): Promise<Result<AgentDefinition>> => {
  const dir = join(PATHS.agents, name);
  const settings = await readJsonFile(join(dir, AGENT_FILES.settings), agentSettingsSchema);
  if (!settings.success) return settings;
  const systemPrompt = await readText(join(dir, AGENT_FILES.system));
  if (!systemPrompt.success) return systemPrompt;
  const task = await readText(join(dir, AGENT_FILES.task));
  if (!task.success) return task;
  const context = await readContext(settings.data.context);
  if (!context.success) return context;
  return ok({
    name,
    settings: settings.data,
    systemPrompt: systemPrompt.data,
    context: context.data,
    task: task.data,
  });
};
