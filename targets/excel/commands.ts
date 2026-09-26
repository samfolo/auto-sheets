/**
 * Commands that act on Excel for the web through the browser session, one step at a time. They
 * run the same steps a case is made of, so a person or the agent can try steps by hand, look at
 * the result, and then write them down as a case.
 */
import { signInToExcel, type SignInState } from './driver/sign-in.ts';
import { excelTarget } from './driver/target.ts';
import { withBrowser } from '../../src/browser/index.ts';
import {
  type Driver,
  performStep,
  formatStep,
  createSheetDriver,
  parseStep,
  stepHelp,
  type SelectionObservation,
} from '../../src/sheet/index.ts';
import {
  readCredentials,
  validate,
  PROJECT,
  ok,
  type Result,
  type Trace,
} from '../../src/kernel/index.ts';
import type { Checkpoint } from '../../src/cases/index.ts';
import { signInCodeSchema } from './contract.ts';
import type { CommandRegistry } from '../../src/cli/index.ts';

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
export const openWorkbookInSession = (
  seed: string | undefined,
  trace: Trace,
): Promise<Result<void>> => withExcel(trace, (driver) => driver.open(seed ?? null));

/** What one step did: the step, and the cells it read if it was an observe step. */
export interface StepOutcome {
  readonly step: string;
  readonly observed: Omit<Checkpoint, 'step'> | null;
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

const renderSelection = ({ active, range, editing }: SelectionObservation): string =>
  `Active cell ${active}${range === null ? '' : `, selected ${range}`}${editing ? ', editing' : ''}.`;

export const renderStepOutcome = ({ step, observed }: StepOutcome): string => {
  if (observed === null) return `Done: ${step}.`;
  if (observed.selection !== undefined) return renderSelection(observed.selection);
  return renderObservations(observed.cells);
};

/** `factory excel …`: signing in, and acting on Excel one step at a time. */
export const registerExcelCommands = ({ program, run }: CommandRegistry): void => {
  const excel = program
    .command('excel')
    .description('act on Excel for the web in the browser session, one step at a time');

  excel
    .command('sign-in')
    .description('sign in to the test account: first request a code, then pass it with --code')
    .option('--code <digits>', 'the six-digit code Microsoft emailed')
    .action(({ code }) => run('excel sign-in', () => excelSignIn({ code }), renderSignIn));

  excel
    .command('open')
    .description('open a workbook that later commands act on: blank, or uploaded with --seed')
    .option('--seed <file>', 'an .xlsx file to upload and start from')
    .action(({ seed }) =>
      run(
        'excel open',
        (trace) => openWorkbookInSession(seed, trace),
        () => (seed === undefined ? 'Opened a blank workbook.' : `Opened ${seed}.`),
      ),
    );

  excel
    .command('do')
    .description('do one step on the open workbook, exactly as a case would')
    .argument('<step>', 'the step, such as enter or observe; see below')
    .argument('[values...]', 'the step’s arguments')
    .addHelpText('after', `\nSteps:\n${stepHelp()}`)
    .action((step, values) =>
      run(`excel do ${step}`, (trace) => doStep(step, values, trace), renderStepOutcome),
    );
};
