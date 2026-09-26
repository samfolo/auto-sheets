/**
 * `factory agent show`: what an agent would be given in a build, exactly as Pi would send it, so
 * a person can review its instructions before any build runs. Nothing calls the model.
 */
import { join } from 'node:path';
import type { CommandRegistry } from '../cli/index.ts';
import { ok, PATHS, readCredentials, type Result } from '../kernel/index.ts';
import { DEFAULT_AGENT, loadAgentDefinition } from './definition.ts';
import { briefAgent, type AgentBriefing } from './runtime.ts';

/** Stands in for the workspace, which a build names after its run. */
const WORKSPACE_PLACEHOLDER = '<run id>';

export interface AgentShown extends AgentBriefing {
  readonly name: string;
}

export const showAgent = async (name: string): Promise<Result<AgentShown>> => {
  const definition = await loadAgentDefinition(name);
  if (!definition.success) return definition;
  const credentials = readCredentials();
  if (!credentials.success) return credentials;
  const briefing = await briefAgent(
    definition.data,
    { workspace: join(PATHS.builds, WORKSPACE_PLACEHOLDER), runDir: PATHS.runs },
    credentials.data.openRouterApiKey,
  );
  if (!briefing.success) return briefing;
  return ok({ name, ...briefing.data });
};

const section = (title: string, body: string): string =>
  `${title}\n${'─'.repeat(title.length)}\n${body}`;

export const renderAgent = ({ name, model, thinking, tools, task, systemPrompt }: AgentShown) =>
  [
    `${name}: ${model}, thinking ${thinking}`,
    `Tools: ${tools.join(', ')}`,
    section('Task', task),
    section('System prompt', systemPrompt),
  ].join('\n\n');

export const registerAgentCommands = ({ program, run }: CommandRegistry): void => {
  const agent = program.command('agent').description('agents: who builds clones, and with what');
  agent
    .command('show')
    .description('print what an agent would be given, exactly as the model would see it')
    .argument('[name]', 'the agent, a folder under agents/', DEFAULT_AGENT)
    .action((name) => run('agent show', () => showAgent(name), renderAgent));
};
