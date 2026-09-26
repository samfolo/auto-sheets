import { chromium, type BrowserContext } from 'playwright';
import { attempt, fail, type Result } from '../kernel/index.ts';
import { BROWSER } from './session.ts';

/**
 * Runs `action` in a new browser that's closed afterwards, for targets that need no sign-in,
 * such as a clone running locally. It has the same window size, locale and permissions as the
 * session browser, so cases behave the same in both.
 */
export const withFreshBrowser = async <T>(
  action: (context: BrowserContext) => Promise<Result<T>>,
  { headless }: { headless: boolean },
): Promise<Result<T>> => {
  const browser = await attempt(
    () => chromium.launch({ headless }),
    (reason) =>
      fail('BROWSER_START_FAILED', 'Could not launch a browser.', {
        details: [reason],
        hint: 'Run `npx playwright install chromium`.',
      }),
  );
  if (!browser.success) return browser;
  try {
    const context = await browser.data.newContext({
      viewport: BROWSER.viewport,
      locale: BROWSER.locale,
      timezoneId: BROWSER.timezoneId,
      permissions: [...BROWSER.permissions],
    });
    return await action(context);
  } finally {
    await browser.data.close();
  }
};
