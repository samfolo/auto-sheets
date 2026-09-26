/**
 * Commands that act on Excel for the web through the browser session, one step at a time.
 * They are the same actions a case is made of, so a person or the agent can try steps by
 * hand, look at the result, and then write them down as a case.
 */
import { createExcelDriver } from '../../targets/excel/driver/driver.ts';
import { signInToExcel, type SignInState } from '../../targets/excel/driver/sign-in.ts';
import { withBrowser } from '../browser/session.ts';
import type { Driver } from '../cases/driver.ts';
import { observeCells } from '../cases/run.ts';
import { cellAddressListSchema, cellAddressSchema, type CellAddress } from '../contracts/case.ts';
import { readCredentials } from '../contracts/environment.ts';
import type { CellObservation } from '../contracts/reference.ts';
import { signInCodeSchema } from '../contracts/sign-in.ts';
import { validate } from '../contracts/validate.ts';
import { PROJECT } from '../core/project.ts';
import type { Result } from '../core/result.ts';

const withExcel = <T>(action: (driver: Driver) => Promise<Result<T>>): Promise<Result<T>> =>
  withBrowser(({ context }) => action(createExcelDriver(context)));

const cellArgument = (cell: string): Result<CellAddress> =>
  validate(cellAddressSchema, cell, `the cell argument ${JSON.stringify(cell)}`);

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

export const openWorkbook = (): Promise<Result<void>> => withExcel((driver) => driver.openBlank());

export const enterCell = async (cell: string, text: string): Promise<Result<void>> => {
  const address = cellArgument(cell);
  if (!address.success) return address;
  return withExcel((driver) => driver.enter(address.data, text));
};

export const observe = async (
  cells: readonly string[],
): Promise<Result<Record<CellAddress, CellObservation>>> => {
  const addresses = validate(cellAddressListSchema, cells, 'the cell arguments');
  if (!addresses.success) return addresses;
  return withExcel((driver) => observeCells(driver, addresses.data));
};

export const undoLast = (): Promise<Result<void>> => withExcel((driver) => driver.undo());
export const redoLast = (): Promise<Result<void>> => withExcel((driver) => driver.redo());

export const renderDone = (message: string) => (): string => message;

export const renderObservations = (observed: Record<CellAddress, CellObservation>): string =>
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
