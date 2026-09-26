/**
 * The browser host: launches Chromium with the persistent profile and keeps it running.
 * `factory browser start` runs this as a detached process; see session.ts. It takes one
 * argument, `headless` or `headed`, and exits when the browser closes.
 */
import { chromium } from 'playwright';
import { PATHS } from '../core/project.ts';
import { BROWSER } from './session.ts';

const context = await chromium.launchPersistentContext(PATHS.browser.profile, {
  headless: process.argv[2] === 'headless',
  viewport: BROWSER.viewport,
  locale: BROWSER.locale,
  timezoneId: BROWSER.timezoneId,
  permissions: [...BROWSER.permissions],
  args: [`--remote-debugging-port=${BROWSER.debugPort}`],
});

context.on('close', () => process.exit(0));
process.stdout.write(`browser ready on port ${BROWSER.debugPort}\n`);
