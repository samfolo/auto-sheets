/**
 * The agent's shell. It is Pi's own bash tool, confined to the workspace and given only what a
 * process needs to run (see childEnvironment), so nothing the agent runs can read the factory's
 * credentials from its environment.
 */
import { createBashToolDefinition, defineTool } from '@earendil-works/pi-coding-agent';
import { childEnvironment } from '../../kernel/index.ts';

export const createBashTool = (workspace: string) =>
  defineTool(
    createBashToolDefinition(workspace, {
      exposeSessionEnvironment: false,
      spawnHook: (context) => ({ ...context, env: { ...childEnvironment() } }),
    }),
  );
