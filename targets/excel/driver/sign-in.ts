/**
 * Signs the browser session in to the test account. The account is passwordless: Microsoft
 * emails a six-digit code, so signing in takes two calls. The first asks for a code; a person
 * reads it from the inbox and passes it to the second. The session then lasts across restarts.
 */
import type { BrowserContext, Page } from 'playwright';
import { attempt } from '../../../src/core/attempt.ts';
import { PROJECT } from '../../../src/core/project.ts';
import { fail, type Result } from '../../../src/core/result.ts';
import { EXCEL } from './excel.ts';

export type SignInState = 'signed-in' | 'code-sent';

const { signIn, timeouts } = EXCEL;

const isSignedIn = (page: Page): Promise<boolean> =>
  page
    .getByRole('heading', { name: signIn.welcomeHeading })
    .waitFor({ timeout: timeouts.actionMs })
    .then(() => true)
    .catch(() => false);

const requestCode = async (page: Page, email: string): Promise<SignInState> => {
  await page.goto(EXCEL.homeUrl, { waitUntil: 'domcontentloaded' });
  if (await isSignedIn(page)) return 'signed-in';
  await page
    .getByRole('link', { name: 'Sign in' })
    .or(page.getByRole('button', { name: 'Sign in' }))
    .first()
    .click();
  await page.getByRole('textbox', { name: signIn.emailBox }).fill(email);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Send code' }).click({ timeout: timeouts.actionMs });
  await page
    .getByRole('textbox', { name: signIn.codeDigit(1) })
    .waitFor({ timeout: timeouts.actionMs });
  return 'code-sent';
};

const enterCode = async (page: Page, code: string): Promise<SignInState> => {
  for (const [index, digit] of Array.from(code).entries()) {
    // Each box takes one digit, in order.
    // oxlint-disable-next-line no-await-in-loop
    await page.getByRole('textbox', { name: signIn.codeDigit(index + 1) }).fill(digit);
  }
  // Microsoft may ask whether to stay signed in; staying signed in keeps the session.
  const staySignedIn = page.getByRole('button', { name: 'Yes' });
  await staySignedIn.click({ timeout: timeouts.actionMs }).catch(() => undefined);
  if (!(await isSignedIn(page))) throw new Error('Excel did not show the signed-in home page.');
  return 'signed-in';
};

/**
 * Without a code: opens Excel and, unless already signed in, asks Microsoft to email a code.
 * With a code: types it into the page left waiting by the first call.
 */
export const signInToExcel = async (
  context: BrowserContext,
  { email, code }: { email: string; code?: string },
): Promise<Result<SignInState>> => {
  const page = context.pages().at(-1) ?? (await context.newPage());
  return attempt(
    () => (code === undefined ? requestCode(page, email) : enterCode(page, code)),
    (reason) =>
      fail(
        'BROWSER_ACTION_FAILED',
        code === undefined
          ? 'Could not request a sign-in code.'
          : 'The sign-in code was not accepted.',
        {
          details: [reason],
          hint:
            code === undefined
              ? `Run \`${PROJECT.cli} browser inspect\` to see where the sign-in page stopped.`
              : 'Codes expire after a few minutes. Request a new one and try again.',
        },
      ),
  );
};
