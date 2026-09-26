import { listControls, screenshot, type FrameControls } from './inspect.ts';
import { readSession, startSession, stopSession, withBrowser } from './session.ts';
import type { BrowserSession } from './contract.ts';
import { displayPath, PATHS, ok, type Result } from '../kernel/index.ts';
import type { CommandRegistry } from '../cli/index.ts';

/** A page's address without its query string, which can carry sign-in state. */
const withoutQuery = (url: string): string => url.split('?')[0] ?? url;

export const startBrowser = (options: { headless: boolean }): Promise<Result<BrowserSession>> =>
  startSession(options);

export const browserStatus = (): Promise<Result<BrowserSession | null>> => readSession();

export const stopBrowser = (): Promise<Result<{ stopped: boolean }>> => stopSession();

export const renderSession = (session: BrowserSession | null): string =>
  session === null
    ? 'No browser session is running.'
    : [
        `Browser running: process ${session.pid}, port ${session.port}, ${session.headless ? 'headless' : 'visible window'}.`,
        `Profile: ${displayPath(PATHS.browser.profile)}`,
      ].join('\n');

export const renderStop = ({ stopped }: { stopped: boolean }): string =>
  stopped ? 'Browser stopped.' : 'No browser session was running.';

/** What `browser inspect` found on the current page. */
export interface Inspection {
  readonly title: string;
  readonly url: string;
  readonly screenshot: string;
  readonly frames: readonly FrameControls[];
}

export const inspectPage = (): Promise<Result<Inspection>> =>
  withBrowser(async ({ page }) => {
    const shot = await screenshot(page, 'inspect');
    if (!shot.success) return shot;
    return ok({
      title: await page.title(),
      url: withoutQuery(page.url()),
      screenshot: displayPath(shot.data),
      frames: await listControls(page),
    });
  });

export const renderInspection = ({ title, url, screenshot: file, frames }: Inspection): string =>
  [
    `Page: ${title}`,
    `URL: ${url}`,
    `Screenshot: ${file}`,
    ...frames.flatMap(({ frame, controls }) => ['', `[${frame}]`, ...controls]),
  ].join('\n');

/** `factory browser …`: the long-lived browser that the Excel and case commands attach to. */
export const registerBrowserCommands = ({ program, run }: CommandRegistry): void => {
  const browser = program
    .command('browser')
    .description('a long-lived browser that other commands attach to');

  browser
    .command('start')
    .description('launch the browser, or report the one already running')
    .option('--headless', 'hide the browser window')
    .action(({ headless }) =>
      run('browser start', () => startBrowser({ headless: headless === true }), renderSession),
    );

  browser
    .command('status')
    .description('report whether the browser is running')
    .action(() => run('browser status', browserStatus, renderSession));

  browser
    .command('stop')
    .description('close the browser')
    .action(() => run('browser stop', stopBrowser, renderStop));

  browser
    .command('inspect')
    .description('list the controls on the current page, by frame, and save a screenshot')
    .action(() => run('browser inspect', inspectPage, renderInspection));
};
