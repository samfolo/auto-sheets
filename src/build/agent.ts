/**
 * Runs Pi, the factory's agent, in a build workspace. Pi is a subprocess with an explicit tool
 * list, its own runtime directory and session directory, and only the environment it needs: it
 * can call the model through OpenRouter, but it never sees the Microsoft credentials. Its JSON
 * events are kept in the run's agent.jsonl with the key redacted, and each tool call is traced
 * into the run's log, next to the events from the `./factory` commands the agent runs.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { agentEventSchema, type AgentEvent } from '../contracts/agent.ts';
import { childEnvironment } from '../contracts/environment.ts';
import { PATHS } from '../core/project.ts';
import type { Trace } from '../core/telemetry.ts';

export const AGENT = {
  /** The package's command-line entry point. */
  cli: join(
    PATHS.root,
    'node_modules',
    '@earendil-works',
    'pi-coding-agent',
    'dist',
    'bundle',
    'cli.js',
  ),
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4.1-flash',
  thinking: 'medium',
  /** Pi's built-in coding tools. Nothing else is loaded. */
  tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
  task: 'Build the clone described in SPEC.md, following the manual in your instructions. Start by reading SPEC.md.',
} as const;

/** How a run of the agent went. */
export interface AgentRun {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly toolCalls: number;
  readonly replies: number;
  readonly tokens: number;
  /** Pi's own estimate, not a bill. */
  readonly estimatedCostUsd: number;
}

export interface AgentOptions {
  readonly workspace: string;
  readonly runDir: string;
  readonly runId: string;
  readonly logFile: string;
  readonly apiKey: string;
  readonly minutes: number;
}

/** Only what Pi and the tools it runs need. Credentials for anything else stay out. */
const agentEnvironment = ({ runDir, runId, logFile, apiKey }: AgentOptions) => ({
  ...childEnvironment(),
  OPENROUTER_API_KEY: apiKey,
  PI_CODING_AGENT_DIR: join(runDir, 'pi'),
  PI_OFFLINE: '1',
  PI_TELEMETRY: '0',
  FACTORY_RUN_ID: runId,
  FACTORY_LOG: logFile,
});

const parseEvent = (line: string): AgentEvent | null => {
  try {
    const parsed = agentEventSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const runAgent = async (options: AgentOptions, trace: Trace): Promise<AgentRun> => {
  const manual = await readFile(join(options.workspace, 'AGENTS.md'), 'utf8');
  const args = [
    AGENT.cli,
    '--offline',
    '--mode',
    'json',
    '--print',
    '--provider',
    AGENT.provider,
    '--model',
    AGENT.model,
    '--thinking',
    AGENT.thinking,
    // Nothing is discovered from disk: no extensions, skills, templates, themes or context
    // files, and no project-local settings. The manual is given explicitly instead.
    '--no-extensions',
    '--no-skills',
    '--no-prompt-templates',
    '--no-themes',
    '--no-context-files',
    '--no-approve',
    '--tools',
    AGENT.tools.join(','),
    '--session-dir',
    join(options.runDir, 'sessions'),
    '--append-system-prompt',
    manual,
    AGENT.task,
  ];
  const agent = spawn(process.execPath, args, {
    cwd: options.workspace,
    env: agentEnvironment(options),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  const redact = (text: string) => text.replaceAll(options.apiKey, '[REDACTED]');
  const totals = { toolCalls: 0, replies: 0, tokens: 0, estimatedCostUsd: 0 };
  const writes: Promise<void>[] = [];
  const record = (line: string) => {
    if (line.trim() === '') return;
    writes.push(appendFile(join(options.runDir, 'agent.jsonl'), `${redact(line)}\n`));
    const event = parseEvent(line);
    if (event?.type === 'tool_execution_start') {
      totals.toolCalls += 1;
      trace('agent.tool', { tool: event.toolName ?? 'unknown' });
    }
    if (event?.type === 'message_end' && event.message?.role === 'assistant') {
      totals.replies += 1;
      totals.tokens += event.message.usage?.totalTokens ?? 0;
      totals.estimatedCostUsd += event.message.usage?.cost?.total ?? 0;
    }
  };

  const pending = { stdout: '' };
  agent.stdout.on('data', (chunk: Buffer) => {
    const lines = `${pending.stdout}${chunk.toString()}`.split('\n');
    pending.stdout = lines.pop() ?? '';
    lines.forEach(record);
  });
  agent.stderr.on('data', (chunk: Buffer) => {
    writes.push(appendFile(join(options.runDir, 'agent.stderr.log'), redact(chunk.toString())));
  });

  const state = { timedOut: false };
  const timer = setTimeout(() => {
    state.timedOut = true;
    if (agent.pid !== undefined) process.kill(-agent.pid, 'SIGTERM');
  }, options.minutes * 60_000);
  const [code]: unknown[] = await once(agent, 'exit');
  const exitCode = typeof code === 'number' ? code : null;
  clearTimeout(timer);
  record(pending.stdout);
  await Promise.all(writes);
  return { exitCode, timedOut: state.timedOut, ...totals };
};
