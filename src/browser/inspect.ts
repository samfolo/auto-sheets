/**
 * Ways to look at a page without knowing its structure in advance. Use them to explore a new
 * target: they show the controls a screen reader would find, which is usually the most
 * stable way to drive and read an application.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Frame, Page } from 'playwright';
import { attempt, PATHS, fail, type Result } from '../kernel/index.ts';

/** Accessibility roles worth listing when exploring: things a person can read or operate. */
const CONTROL_ROLES =
  /^\s*- (alert|alertdialog|button|checkbox|combobox|dialog|grid|gridcell|heading|link|menuitem|status|tab|textbox)\b/;

/** The controls in one frame of a page, as lines of Playwright's accessibility snapshot. */
export interface FrameControls {
  /** `main` for the page itself, otherwise the iframe's name or address. */
  readonly frame: string;
  readonly controls: readonly string[];
}

const controlsIn = async (frame: Frame, label: string): Promise<FrameControls> => {
  const snapshot = await frame
    .locator('body')
    .ariaSnapshot({ timeout: 5_000 })
    .catch(() => '');
  return {
    frame: label,
    controls: snapshot.split('\n').filter((line) => CONTROL_ROLES.test(line)),
  };
};

/** Lists the controls on the page and in each of its iframes. */
export const listControls = async (page: Page): Promise<FrameControls[]> => {
  const iframes = await page.locator('iframe').all();
  const children = await Promise.all(
    iframes.map(async (iframe) => {
      const frame = await (await iframe.elementHandle())?.contentFrame();
      const label = (await iframe.getAttribute('name')) ?? (await iframe.getAttribute('src'));
      return frame ? controlsIn(frame, label ?? 'iframe') : undefined;
    }),
  );
  const frames = [await controlsIn(page.mainFrame(), 'main'), ...children];
  return frames.filter(
    (frame): frame is FrameControls => frame !== undefined && frame.controls.length > 0,
  );
};

/** Saves a screenshot of the page and returns its path. */
export const screenshot = async (page: Page, name: string): Promise<Result<string>> => {
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const file = join(PATHS.browser.screenshots, `${stamp}-${name}.png`);
  return attempt(
    async () => {
      await mkdir(PATHS.browser.screenshots, { recursive: true });
      await page.screenshot({ path: file });
      return file;
    },
    (reason) =>
      fail('BROWSER_ACTION_FAILED', 'Could not take a screenshot.', { details: [reason] }),
  );
};
