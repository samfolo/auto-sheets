/**
 * The agent's shell. It is Pi's own bash tool with two changes: each command runs inside the
 * workspace's sandbox (see src/kernel/sandbox.ts), and with only what a process needs from the
 * environment (see childEnvironment), so nothing the agent runs can read the factory's
 * credentials, other builds, or stop processes it didn't start.
 */
import { createBashToolDefinition, defineTool } from '@earendil-works/pi-coding-agent';
import { childEnvironment, sandboxProfile, SANDBOX_EXEC } from '../../kernel/index.ts';

/** Quotes text as one argument for the shell. */
const shellQuote = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

export const createBashTool = (workspace: string) =>
  defineTool(
    createBashToolDefinition(workspace, {
      exposeSessionEnvironment: false,
      spawnHook: (context) => ({
        ...context,
        command: `exec ${SANDBOX_EXEC} -p ${shellQuote(sandboxProfile(workspace))} /bin/bash -c ${shellQuote(context.command)}`,
        env: { ...childEnvironment() },
      }),
    }),
  );
