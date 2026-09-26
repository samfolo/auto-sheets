/**
 * Commands that act on Excel for the web through the browser session, one step at a time. They
 * run the same steps a case is made of, so a person or the agent can try steps by hand, look at
 * the result, and then write them down as a case.
 */
import { signInToExcel, type SignInState } from '../../targets/excel/driver/sign-in.ts';
import { excelTarget } from '../../targets/excel/driver/target.ts';
import { withBrowser } from '../browser/session.ts';
import type { Driver } from '../cases/driver.ts';
import { performStep } from '../cases/run.ts';
import { formatStep } from '../cases/steps.ts';
import { readCredentials } from '../contracts/environment.ts';
import type { Checkpoint } from '../contracts/reference.ts';
import { signInCodeSchema } from '../contracts/sign-in.ts';
import { validate } from '../contracts/validate.ts';
import { PROJECT } from '../core/project.ts';
import { ok, type Result } from '../core/result.ts';
import type { Trace } from '../core/telemetry.ts';
import { createSheetDriver } from '../sheet/driver.ts';
import { parseStep } from './steps.ts';

const withExcel = <T>(
  trace: Trace,
  action: (driver: Driver) => Promise<Result<T>>,
): Promise<Result<T>> =>
  withBrowser(({ context }) => action(createSheetDriver(excelTarget(context), trace)));

export const excelSignIn = async ({ code }: { code?: string }): Promise<Result<SignInState>> => {
  const checkedCode =
    code === undefined ? undefined : validate(signInCodeSchema, code, 'the --code option');
  if (checkedCode?.success === false) return checkedCode;
  const credentials = readCredentials();
  if (!credentials.success) return credentials;
  const { email } = credentials.data.microsoftAccount;
  return withBrowser(({ context }) => signInToExcel(context, { email, code: checkedCode?.data }));
};

export const renderSignIn = (state: SignInState): string =>
  state === 'signed-in'
    ? 'Signed in to Excel for the web.'
    : `Microsoft has emailed a sign-in code to the test account.\nRun \`${PROJECT.cli} excel sign-in --code <code>\` with it.`;

/** Opens a blank workbook, or uploads a seed workbook from disk. */
export const openWorkbook = (seed: string | undefined, trace: Trace): Promise<Result<void>> =>
  withExcel(trace, (driver) => driver.open(seed ?? null));

/** What one step did: the step, and the cells it read if it was an observe step. */
export interface StepOutcome {
  readonly step: string;
  readonly observed: Checkpoint['cells'] | null;
}

export const doStep = async (
  name: string,
  values: readonly string[],
  trace: Trace,
): Promise<Result<StepOutcome>> => {
  const step = parseStep(name, values);
  if (!step.success) return step;
  return withExcel(trace, async (driver) => {
    const done = await performStep(driver, step.data);
    return done.success ? ok({ step: formatStep(step.data), observed: done.data }) : done;
  });
};

const renderObservations = (observed: Checkpoint['cells']): string =>
  Object.entries(observed)
    .map(([cell, { raw, display, annotations }]) =>
      [
        cell.padEnd(6),
        `raw ${JSON.stringify(raw)}`.padEnd(24),
        `shows ${JSON.stringify(display)}`,
        annotations.length > 0 ? `  (${annotations.join('; ')})` : '',
      ].join(''),
    )
    .join('\n');

export const renderStepOutcome = ({ step, observed }: StepOutcome): string =>
  observed === null ? `Done: ${step}.` : renderObservations(observed);
