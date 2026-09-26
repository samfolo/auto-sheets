/**
 * A clone built to spec.md, as a target for the sheet driver: the same steps that were recorded
 * on Excel run on the clone through the same four controls. Opening a sheet resets the clone's
 * in-memory workbook through its API, optionally with a seed, and then loads its screen.
 */
import { readFile } from 'node:fs/promises';
import type { BrowserContext, Page } from 'playwright';
import type {
  SheetTarget,
  SheetSelectors,
  SheetTiming,
  Surface,
} from '../../../src/sheet/index.ts';

export const CLONE = {
  environment: 'auto-sheets clone of Excel for the web',
  /** The controls spec.md requires. */
  sheet: {
    nameBox: '#name-box',
    formulaBar: '#formula-bar',
    cellEditor: '#cell-editor',
    readout: '#readout',
  } satisfies SheetSelectors,
  api: {
    health: '/api/health',
    reset: '/api/reset',
  },
  /**
   * The clone runs locally and should be deterministic, so nothing is retried: a clone that
   * drops input fails instead of being papered over.
   */
  timing: {
    actionMs: 5_000,
    pollMs: 50,
    settleMs: 200,
    keystrokeMs: 0,
    selectTries: 1,
    typingTries: 1,
    commitTries: 1,
  } satisfies SheetTiming,
  /** Loading the clone's screen after a reset. */
  loadMs: 15_000,
} as const;

const surfaceOf = (page: Page): Surface => ({
  page,
  frame: page.mainFrame(),
  selectors: CLONE.sheet,
  timing: CLONE.timing,
});

/** Resets the clone's workbook: blank, or loaded from a seed workbook on disk. */
const reset = async (url: string, seed: string | null): Promise<void> => {
  const body = seed === null ? {} : { seed: (await readFile(seed)).toString('base64') };
  const response = await fetch(new URL(CLONE.api.reset, url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`The clone's reset answered ${response.status}.`);
};

/** A clone running at `url`, driven in `context`. */
export const cloneTarget = (context: BrowserContext, url: string): SheetTarget => ({
  name: 'clone',
  environment: CLONE.environment,
  open: async (seed) => {
    await reset(url, seed);
    const page = context.pages().at(-1) ?? (await context.newPage());
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator(CLONE.sheet.nameBox).waitFor({ timeout: CLONE.loadMs });
    return surfaceOf(page);
  },
  findOpen: async () => {
    const page = context.pages().find((candidate) => candidate.url().startsWith(url));
    return page === undefined ? null : surfaceOf(page);
  },
});
