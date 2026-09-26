/**
 * The browser host: launches Chromium with the persistent profile and keeps it running.
 * `factory browser start` runs this as a detached process; see session.ts. It takes one option,
 * `--headless`, and exits when the browser closes.
 */
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { PATHS } from '../kernel/index.ts';
import { BROWSER } from './session.ts';

// Strict parsing: an option the host doesn't know is a bug in session.ts, so it throws.
const { values } = parseArgs({ options: { headless: { type: 'boolean', default: false } } });

const context = await chromium.launchPersistentContext(PATHS.browser.profile, {
  headless: values.headless,
  viewport: BROWSER.viewport,
  locale: BROWSER.locale,
  timezoneId: BROWSER.timezoneId,
  permissions: [...BROWSER.permissions],
  args: [`--remote-debugging-port=${BROWSER.debugPort}`],
});

context.on('close', () => process.exit(0));
process.stdout.write(`browser ready on port ${BROWSER.debugPort}\n`);
