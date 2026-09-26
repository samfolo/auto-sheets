import { listControls, screenshot, type FrameControls } from '../browser/inspect.ts';
import { readSession, startSession, stopSession, withBrowser } from '../browser/session.ts';
import type { BrowserSession } from '../contracts/browser.ts';
import { displayPath } from '../contracts/files.ts';
import { PATHS } from '../core/project.ts';
import { ok, type Result } from '../core/result.ts';

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
