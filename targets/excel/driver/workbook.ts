/**
 * Opening workbooks in Excel for the web: a blank one, or one uploaded from disk as a case's
 * seed. Both happen in the one working tab, so the browser never collects tabs.
 *
 * A workbook is ready later than it looks. A new workbook first opens in a temporary editor;
 * Excel then saves it to OneDrive, moves the page to the saved document's address and starts a
 * new editor, discarding anything typed into the first. So a workbook counts as open only once
 * the page is at a saved address and the new editor has loaded its clipboard frame.
 */
import type { BrowserContext, Frame, Page } from 'playwright';
import type { Surface } from '../../../src/sheet/surface.ts';
import { EXCEL } from './excel.ts';

const { timeouts } = EXCEL;

const isSavedWorkbook = (url: URL): boolean =>
  url.pathname.startsWith(EXCEL.savedWorkbookPath) && url.searchParams.has('docId');

const surfaceOf = (page: Page, frame: Frame): Surface => ({
  page,
  frame,
  selectors: EXCEL.sheet,
  timing: EXCEL.timing,
});

const findEditor = async (page: Page, timeout: number): Promise<Frame | null> => {
  const element = await page.locator(EXCEL.editorFrame).elementHandle({ timeout });
  return (await element?.contentFrame()) ?? null;
};

/** Waits until the saved workbook's editor is ready, and returns its frame. */
const whenReady = async (page: Page): Promise<Frame> => {
  await page.waitForURL(isSavedWorkbook, { timeout: timeouts.openWorkbookMs });
  await page
    .waitForEvent('framenavigated', {
      predicate: (frame) => frame.url().startsWith(EXCEL.clipboardFrameUrl),
      timeout: timeouts.clipboardFrameMs,
    })
    .catch(() => undefined);
  await page.waitForTimeout(timeouts.editorRestartMs);
  const frame = await findEditor(page, timeouts.openWorkbookMs);
  if (frame === null) throw new Error('The workbook editor did not appear.');
  await frame.locator(EXCEL.sheet.nameBox).waitFor({ timeout: timeouts.openWorkbookMs });
  return frame;
};

/** The one tab commands work in. Any other tabs are closed. */
const workingTab = async (context: BrowserContext): Promise<Page> => {
  const pages = context.pages();
  const page = pages.at(-1) ?? (await context.newPage());
  await Promise.all(pages.filter((other) => other !== page).map((other) => other.close()));
  return page;
};

/** Opens a blank workbook, or uploads `seed` from disk and opens that. */
export const openWorkbook = async (
  context: BrowserContext,
  seed: string | null,
): Promise<Surface> => {
  const page = await workingTab(context);
  await page.goto(EXCEL.homeUrl, { waitUntil: 'domcontentloaded' });
  if (seed === null) {
    await page
      .getByRole('button', { name: EXCEL.home.createBlank })
      .click({ timeout: timeouts.openWorkbookMs });
  } else {
    const choosing = page.waitForEvent('filechooser', { timeout: timeouts.openWorkbookMs });
    await page.getByRole('button', { name: EXCEL.home.upload }).click();
    await (await choosing).setFiles(seed);
  }
  return surfaceOf(page, await whenReady(page));
};

/** The workbook already open in the working tab, if there is one. */
export const findOpenWorkbook = async (context: BrowserContext): Promise<Surface | null> => {
  const page = context.pages().findLast((candidate) => isSavedWorkbook(new URL(candidate.url())));
  const frame = page === undefined ? null : await findEditor(page, timeouts.openWorkbookMs);
  return page === undefined || frame === null ? null : surfaceOf(page, frame);
};
