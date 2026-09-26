/**
 * Running a clone from its workspace the way its spec says it runs: `npm start` with the port in
 * PORT, ready once `/api/health` answers. The agent's check_cases tool and the build's final
 * check both start the clone this way, so the agent is checked exactly as it will be judged, on
 * the code as it is on disk.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLONE } from '../../targets/excel/index.ts';
import { childEnvironment, fail, poll, type Result } from '../kernel/index.ts';

export const CLONE_APP = {
  /** Where the factory runs a clone to check it, away from the port the agent uses itself. */
  port: 4399,
  /** How long a clone has to answer its health check after `npm start`. */
  startup: { timeoutMs: 60_000, intervalMs: 500 },
  /** How many of the app's last output lines a failure to start includes. */
  outputLines: 20,
} as const;

type Health = 'ready' | 'starting' | 'exited';

/** Runs `npm start` in the workspace, calls `use` with the clone's address, then stops it. */
export const withCloneApp = async <T>(
  workspace: string,
  logFile: string,
  use: (url: string) => Promise<Result<T>>,
): Promise<Result<T>> => {
  if (!existsSync(join(workspace, 'package.json'))) {
    return fail('CLONE_NOT_RUNNING', 'The workspace has no package.json, so nothing can start.', {
      location: workspace,
    });
  }
  const url = `http://localhost:${CLONE_APP.port}`;
  const log = createWriteStream(logFile, { flags: 'a' });
  const output: string[] = [];
  const app = spawn('npm', ['start'], {
    cwd: workspace,
    env: { ...childEnvironment(), PORT: String(CLONE_APP.port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, so stopping it also stops whatever `npm start` launched.
    detached: true,
  });
  const keep = (chunk: Buffer): void => {
    log.write(chunk);
    output.push(...chunk.toString().split('\n'));
    output.splice(0, Math.max(0, output.length - CLONE_APP.outputLines));
  };
  app.stdout.on('data', keep);
  app.stderr.on('data', keep);

  const health = async (): Promise<Health> => {
    if (app.exitCode !== null) return 'exited';
    const answered = await fetch(new URL(CLONE.api.health, url)).then(
      (response) => response.ok,
      () => false,
    );
    return answered ? 'ready' : 'starting';
  };
  try {
    const started = await poll(health, (state) => state !== 'starting', CLONE_APP.startup);
    if (started.last !== 'ready') {
      return fail(
        'CLONE_NOT_RUNNING',
        started.last === 'exited'
          ? `\`npm start\` exited with code ${app.exitCode} before the clone answered.`
          : `The clone did not answer at ${url} within ${CLONE_APP.startup.timeoutMs / 1000} seconds.`,
        { location: logFile, details: output.filter((line) => line.trim() !== '') },
      );
    }
    return await use(url);
  } finally {
    if (app.pid !== undefined && app.exitCode === null) process.kill(-app.pid, 'SIGTERM');
    log.end();
  }
};
