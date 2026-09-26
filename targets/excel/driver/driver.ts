/**
 * Drives Excel for the web the way a keyboard user does, through its accessibility interface:
 * the Name Box to move the selection, the formula bar to type, and the screen-reader readout
 * to see what a cell shows. The grid is drawn on a canvas, so there is nothing else to read.
 */
import type { BrowserContext, Frame, Page } from 'playwright';
import { screenshot } from '../../../src/browser/inspect.ts';
import { cellBelow } from '../../../src/cases/address.ts';
import type { Driver } from '../../../src/cases/driver.ts';
import type { CellAddress } from '../../../src/contracts/case.ts';
import { displayPath } from '../../../src/contracts/files.ts';
import type { CellObservation } from '../../../src/contracts/reference.ts';
import { attempt } from '../../../src/core/attempt.ts';
import { PROJECT } from '../../../src/core/project.ts';
import { fail, ok, type Result } from '../../../src/core/result.ts';
import { EXCEL } from './excel.ts';
import { parseReadout } from './readout.ts';

const { selectors, timeouts } = EXCEL;

/** An open workbook: its tab, and the iframe the editor runs in. */
interface Workbook {
  readonly page: Page;
  readonly editor: Frame;
}

/** A failed action, with a screenshot of what the page looked like at the time. */
const actionFailed = async (
  page: Page,
  message: string,
  reason: string,
): Promise<Result<never>> => {
  const shot = await screenshot(page, 'excel-failure');
  return fail('BROWSER_ACTION_FAILED', message, {
    details: [reason, ...(shot.success ? [`screenshot: ${displayPath(shot.data)}`] : [])],
  });
};

/** Waits until the Name Box shows `address`; resolves to false if it doesn't in time. */
const nameBoxReaches = (editor: Frame, address: string, timeout: number): Promise<boolean> =>
  editor
    .waitForFunction(
      ([selector, expected]) => {
        const box = document.querySelector(selector);
        return box instanceof HTMLInputElement && box.value === expected;
      },
      [selectors.nameBox, address] as const,
      { timeout },
    )
    .then(() => true)
    .catch(() => false);

const waitForNameBox = async (editor: Frame, address: string): Promise<void> => {
  if (!(await nameBoxReaches(editor, address, timeouts.actionMs))) {
    throw new Error(`The Name Box did not reach ${address}.`);
  }
};

/** Waits until the readout describes `address`, then returns its label. */
const waitForReadout = async (editor: Frame, address: string): Promise<string> => {
  const label = await editor.waitForFunction(
    ([selector, marker]) => {
      const text = document.querySelector(selector)?.getAttribute('aria-label') ?? '';
      return text.includes(marker) ? text : false;
    },
    [selectors.readout, `${address} . `] as const,
    { timeout: timeouts.actionMs },
  );
  return String(await label.jsonValue());
};

const selectCell = async ({ page, editor }: Workbook, cell: CellAddress): Promise<void> => {
  await editor.locator(selectors.nameBox).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(cell);
  await page.keyboard.press('Enter');
  await editor.locator(selectors.grid).focus();
  await waitForNameBox(editor, cell);
};

/** Whether the in-cell editor holds exactly `text`, waiting briefly for it to catch up. */
const cellEditorShows = (editor: Frame, text: string): Promise<boolean> =>
  editor
    .waitForFunction(
      // The editor renders spaces as non-breaking spaces, so compare with those normalised.
      ([selector, expected]) =>
        document.querySelector(selector)?.textContent?.replaceAll('\u00a0', ' ') === expected,
      [selectors.grid, text] as const,
      { timeout: timeouts.typingMs },
    )
    .then(() => true)
    .catch(() => false);

/**
 * Types into the selected cell, which replaces its content, the way a person overwrites a cell.
 * Checks the text reached the in-cell editor before anything is committed: keystrokes sent
 * while the editor is starting can be dropped. On a mismatch, Escape cancels the edit and the
 * text is typed again.
 */
const typeIntoCell = async (
  { page, editor }: Workbook,
  text: string,
  triesLeft: number = timeouts.typingTries,
): Promise<void> => {
  await editor.locator(selectors.grid).focus();
  await page.keyboard.type(text);
  if (await cellEditorShows(editor, text)) return;
  const shown = await editor.locator(selectors.grid).textContent();
  await page.keyboard.press('Escape');
  if (triesLeft > 1) return typeIntoCell({ page, editor }, text, triesLeft - 1);
  throw new Error(`The cell editor showed ${JSON.stringify(shown)} after typing.`);
};

/** The cell's raw content, as the formula bar shows it once the cell is selected. */
const readRaw = async (open: Workbook, cell: CellAddress): Promise<string> => {
  await selectCell(open, cell);
  await waitForReadout(open.editor, cell);
  return (await open.editor.locator(selectors.formulaBar).textContent()) ?? '';
};

/**
 * Enters text in a cell and confirms it stuck. Two checks: Enter moves the selection to the
 * cell below, and the cell then holds something. Under automation Excel can drop an entry,
 * most often the first in a new workbook, while the selection still moves; the cell is then
 * empty although non-blank text was typed. A dropped entry is tried again.
 */
const enterAndConfirm = async (
  open: Workbook,
  cell: CellAddress,
  text: string,
  triesLeft: number = timeouts.commitTries,
): Promise<void> => {
  await selectCell(open, cell);
  await typeIntoCell(open, text);
  await open.page.keyboard.press('Enter');
  const moved = await nameBoxReaches(open.editor, cellBelow(cell), timeouts.actionMs);
  if (!moved) await open.page.keyboard.press('Escape');
  const dropped = !moved || (text.trim() !== '' && (await readRaw(open, cell)) === '');
  if (!dropped) return;
  if (triesLeft > 1) return enterAndConfirm(open, cell, text, triesLeft - 1);
  throw new Error(`Excel did not keep the entry in ${cell} after ${timeouts.commitTries} tries.`);
};

const findEditor = async (page: Page): Promise<Frame | null> => {
  const element = await page
    .locator(selectors.editorFrame)
    .elementHandle({ timeout: timeouts.openWorkbookMs });
  return (await element?.contentFrame()) ?? null;
};

/** Whether the page shows a workbook that Excel has saved to OneDrive. */
const isSavedWorkbook = (url: URL): boolean =>
  url.pathname.startsWith(EXCEL.savedWorkbookPath) && url.searchParams.has('docId');

/**
 * Creates a blank workbook in a new tab and closes every other tab. A new workbook first opens
 * in a temporary editor; Excel then saves it to OneDrive, moves the page to the saved
 * document's address and starts a new editor, discarding anything typed into the first one.
 * So the workbook is ready only once the page is at the saved address and its editor is up.
 */
const createWorkbook = async (context: BrowserContext): Promise<Workbook> => {
  const page = await context.newPage();
  await page.goto(EXCEL.homeUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create blank workbook' }).click({
    timeout: timeouts.openWorkbookMs,
  });
  await page.waitForURL(isSavedWorkbook, { timeout: timeouts.openWorkbookMs });
  // The replacement editor loads its clipboard frame last; wait for it, but don't depend on it.
  await page
    .waitForEvent('framenavigated', {
      predicate: (frame) => frame.url().startsWith(EXCEL.clipboardFrameUrl),
      timeout: timeouts.openWorkbookMs,
    })
    .catch(() => undefined);
  await page.waitForTimeout(timeouts.editorRestartMs);
  const editor = await findEditor(page);
  if (editor === null) throw new Error('The workbook editor frame did not appear.');
  await waitForNameBox(editor, 'A1');
  await Promise.all(
    context
      .pages()
      .filter((other) => other !== page)
      .map((other) => other.close()),
  );
  return { page, editor };
};

/** Finds a workbook that is already open, such as one left by `factory excel open`. */
const findOpenWorkbook = async (context: BrowserContext): Promise<Workbook | null> => {
  const page = context
    .pages()
    .findLast((candidate) => candidate.url().startsWith(`${EXCEL.homeUrl}open/`));
  const editor = page === undefined ? null : await findEditor(page);
  return page === undefined || editor === null ? null : { page, editor };
};

/**
 * A driver for Excel for the web, running in the attached browser. It works on the workbook
 * it opened, or on one already open in the browser.
 */
export const createExcelDriver = (context: BrowserContext): Driver => {
  const state: { workbook: Workbook | null } = { workbook: null };

  const workbook = async (): Promise<Result<Workbook>> => {
    state.workbook ??= await findOpenWorkbook(context);
    return state.workbook === null
      ? fail('BROWSER_ACTION_FAILED', 'No Excel workbook is open.', {
          hint: `Run \`${PROJECT.cli} excel open\` to create a blank one.`,
        })
      : ok(state.workbook);
  };

  /** Runs an action on the open workbook, turning a Playwright failure into a Result. */
  const onWorkbook = async <T>(
    message: string,
    action: (open: Workbook) => Promise<T>,
  ): Promise<Result<T>> => {
    const open = await workbook();
    if (!open.success) return open;
    return attempt(
      () => action(open.data),
      (reason) => actionFailed(open.data.page, message, reason),
    );
  };

  const pressOnGrid = (keys: string, action: string) =>
    onWorkbook(`Excel did not ${action}.`, async ({ page, editor }) => {
      await editor.locator(selectors.grid).focus();
      await page.keyboard.press(keys);
      await page.waitForTimeout(timeouts.settleMs);
    });

  return {
    target: 'excel',
    environment: EXCEL.environment,

    openBlank: async () => {
      const opened = await attempt(
        () => createWorkbook(context),
        (reason) =>
          fail('BROWSER_ACTION_FAILED', 'Could not create a blank workbook.', {
            details: [reason],
            hint: `If Excel asks you to sign in, run \`${PROJECT.cli} excel sign-in\`.`,
          }),
      );
      if (!opened.success) return opened;
      state.workbook = opened.data;
      return ok(undefined);
    },

    enter: (cell, text) =>
      onWorkbook(`Excel did not accept ${JSON.stringify(text)} in ${cell}.`, (open) =>
        enterAndConfirm(open, cell, text),
      ),

    undo: () => pressOnGrid('ControlOrMeta+Z', 'undo'),
    redo: () => pressOnGrid('ControlOrMeta+Y', 'redo'),

    observe: async (cell) => {
      const read = await onWorkbook(`Could not read ${cell}.`, async (open) => {
        await selectCell(open, cell);
        const label = await waitForReadout(open.editor, cell);
        const raw = (await open.editor.locator(selectors.formulaBar).textContent()) ?? '';
        return { label, raw };
      });
      if (!read.success) return read;
      const readout = parseReadout(read.data.label, cell);
      if (readout === null) {
        return fail('BROWSER_ACTION_FAILED', `Excel's readout did not describe ${cell}.`, {
          details: [`readout: ${JSON.stringify(read.data.label)}`],
        });
      }
      const observation: CellObservation = {
        raw: read.data.raw,
        display: readout.display,
        annotations: [...readout.annotations],
      };
      return ok(observation);
    },
  };
};
