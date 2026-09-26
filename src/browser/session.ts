/**
 * A long-lived browser that short commands attach to.
 *
 * `factory browser start` launches Chromium once. Every later command (inspect, the Excel
 * actions, case recording) attaches to that same browser instead of launching its own, so
 * the Microsoft sign-in and the open workbook carry over from one command to the next, the
 * way they would for a person at the keyboard. This is what lets an experiment be built up a
 * few steps at a time: act, look at the result, decide the next step.
 *
 * Three terms:
 * - The profile is the folder where Chromium keeps its state (PATHS.browser.profile). The
 *   part that matters is the cookies holding the Microsoft sign-in, which is why a sign-in
 *   survives restarts. The rest, such as GPUCache, is Chromium's own cache. It is gitignored
 *   and must never be committed.
 * - The Chrome DevTools Protocol (CDP) is the remote-control protocol Chromium exposes, the
 *   same one its DevTools use. The browser listens on a local port, and Playwright attaches
 *   to it over CDP.
 * - The host is the small Node process (host.ts) that launches the browser and keeps it
 *   running. Stopping the host closes the browser.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { browserSessionSchema, type BrowserSession } from '../contracts/browser.ts';
import { readJsonFile, writeJsonFile } from '../contracts/files.ts';
import { attempt } from '../core/attempt.ts';
import { PATHS, PROJECT } from '../core/project.ts';
import { fail, ok, type Result } from '../core/result.ts';

/** How the session's browser is launched. host.ts reads the same settings. */
export const BROWSER = {
  /** The local port for DevTools Protocol connections. */
  debugPort: 9333,
  viewport: { width: 1440, height: 900 },
  /** Recorded observations were made with these, so keep them fixed. */
  locale: 'en-GB',
  timezoneId: 'Europe/London',
  /** How long `start` waits for the browser to accept connections, and how often it checks. */
  startTimeoutMs: 30_000,
  pollIntervalMs: 250,
} as const;

/** What a command gets when it attaches: the browser's context and the page to act on. */
export interface Attached {
  readonly context: BrowserContext;
  /** The most recently opened tab, which is where the last command left off. */
  readonly page: Page;
}

const endpoint = (port: number): string => `http://127.0.0.1:${port}`;

const isResponding = async (port: number): Promise<boolean> => {
  const response = await attempt(
    () => fetch(`${endpoint(port)}/json/version`),
    () => fail('BROWSER_NOT_RUNNING', 'The browser is not responding.'),
  );
  return response.success && response.data.ok;
};

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Polls until the browser accepts connections, or until the deadline passes. */
const waitUntilResponding = async (port: number, deadline: number): Promise<boolean> => {
  if (await isResponding(port)) return true;
  if (performance.now() >= deadline) return false;
  await sleep(BROWSER.pollIntervalMs);
  return waitUntilResponding(port, deadline);
};

/** The running session, or null if there is none. Clears a session file left by a crash. */
export const readSession = async (): Promise<Result<BrowserSession | null>> => {
  if (!existsSync(PATHS.browser.session)) return ok(null);
  const session = await readJsonFile(PATHS.browser.session, browserSessionSchema);
  if (!session.success) return session;
  if (isAlive(session.data.pid) && (await isResponding(session.data.port))) return session;
  rmSync(PATHS.browser.session, { force: true });
  return ok(null);
};

/** Starts the browser, or returns the session that is already running. */
export const startSession = async ({
  headless,
}: {
  headless: boolean;
}): Promise<Result<BrowserSession>> => {
  const running = await readSession();
  if (!running.success) return running;
  if (running.data !== null) return ok(running.data);

  mkdirSync(PATHS.browser.profile, { recursive: true });
  const log = openSync(PATHS.browser.hostLog, 'a');
  const host = spawn(process.execPath, [PATHS.browser.host, headless ? 'headless' : 'headed'], {
    detached: true,
    stdio: ['ignore', log, log],
  });
  host.unref();

  const started = await waitUntilResponding(
    BROWSER.debugPort,
    performance.now() + BROWSER.startTimeoutMs,
  );
  if (!started || host.pid === undefined) {
    return fail('BROWSER_START_FAILED', 'The browser did not start accepting connections.', {
      location: PATHS.browser.hostLog,
      hint: 'Read the host log. If another browser is using the profile, close it and try again.',
    });
  }
  const session: BrowserSession = {
    pid: host.pid,
    port: BROWSER.debugPort,
    headless,
    startedAt: new Date().toISOString(),
  };
  const written = await writeJsonFile(PATHS.browser.session, session);
  return written.success ? ok(session) : written;
};

/** Stops the browser. Stopping when nothing is running is not an error. */
export const stopSession = async (): Promise<Result<{ stopped: boolean }>> => {
  const running = await readSession();
  if (!running.success) return running;
  if (running.data === null) return ok({ stopped: false });
  process.kill(running.data.pid, 'SIGTERM');
  rmSync(PATHS.browser.session, { force: true });
  return ok({ stopped: true });
};

/**
 * Attaches to the running browser, runs `action`, and always detaches afterwards. Detaching
 * leaves the browser and its tabs open for the next command.
 */
export const withBrowser = async <T>(
  action: (attached: Attached) => Promise<Result<T>>,
): Promise<Result<T>> => {
  const running = await readSession();
  if (!running.success) return running;
  if (running.data === null) {
    return fail('BROWSER_NOT_RUNNING', 'No browser session is running.', {
      hint: `Run \`${PROJECT.cli} browser start\`.`,
    });
  }
  const { port } = running.data;
  const browser = await attempt(
    () => chromium.connectOverCDP(endpoint(port)),
    (reason) =>
      fail('BROWSER_NOT_RUNNING', 'Could not attach to the browser.', { details: [reason] }),
  );
  if (!browser.success) return browser;
  try {
    const [context] = browser.data.contexts();
    if (context === undefined) {
      return fail('BROWSER_ACTION_FAILED', 'The browser has no open context.');
    }
    const page = context.pages().at(-1) ?? (await context.newPage());
    return await action({ context, page });
  } finally {
    await browser.data.close();
  }
};
