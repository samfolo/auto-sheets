/**
 * What a person does with a spreadsheet, expressed through its accessible controls: select
 * through the Name Box, type into the cell, press shortcuts, and read the formula bar and the
 * screen-reader readout. These functions throw when the page doesn't respond (they call
 * Playwright); the sheet driver turns a throw into a Result.
 *
 * Every action is one of three kinds, which decides whether it may be repeated:
 * - a read changes nothing, so it can be repeated freely;
 * - typing before a commit can be cancelled with Escape and typed again;
 * - a change to the sheet also changes its undo history. Repeating one could apply it twice,
 *   so it's repeated only when the sheet provably didn't change. Otherwise the problem is
 *   reported, or traced when it can't be proved, and recording each case twice catches the rest.
 */
import { cellBelow } from './address.ts';
import type { CellAddress, RangeAddress } from '../contracts/case.ts';
import type { CellObservation } from '../contracts/reference.ts';
import { poll } from '../core/poll.ts';
import type { Trace } from '../core/telemetry.ts';
import { KEYS } from './keys.ts';
import { describesSelection, parseReadout } from './readout.ts';
import type { Surface } from './surface.ts';

const readLabel = async ({ frame, selectors }: Surface): Promise<string> =>
  (await frame.locator(selectors.readout).getAttribute('aria-label')) ?? '';

const readNameBox = ({ frame, selectors }: Surface): Promise<string> =>
  frame.locator(selectors.nameBox).inputValue();

/** The in-cell editor's text. It renders spaces as non-breaking spaces, so normalise them. */
const readCellEditor = async ({ frame, selectors }: Surface): Promise<string> =>
  ((await frame.locator(selectors.cellEditor).textContent()) ?? '').replaceAll(' ', ' ');

const until = <T>(surface: Surface, read: () => Promise<T>, accept: (value: T) => boolean) =>
  poll(read, accept, { timeoutMs: surface.timing.actionMs, intervalMs: surface.timing.pollMs });

/** Presses a key with the grid focused, then waits, since most shortcuts give no signal. */
export const press = async (surface: Surface, key: string): Promise<void> => {
  await surface.frame.locator(surface.selectors.cellEditor).focus();
  await surface.page.keyboard.press(key);
  await surface.page.waitForTimeout(surface.timing.settleMs);
};

/** Types an address into the Name Box and presses Enter, which moves the selection there. */
const goTo = async ({ page, frame, selectors }: Surface, range: RangeAddress): Promise<void> => {
  await frame.locator(selectors.nameBox).click();
  await page.keyboard.press(KEYS.selectAllText);
  await page.keyboard.type(range);
  await page.keyboard.press(KEYS.commit);
  await frame.locator(selectors.cellEditor).focus();
};

/**
 * Whether selecting `range` would leave the selection where it is. The readout only updates
 * when the selection changes, so selecting the cell that's already active, such as A1 in a new
 * workbook, would never be confirmed.
 */
const isUnchangedSelection = async (surface: Surface, range: RangeAddress): Promise<boolean> =>
  !range.includes(':') &&
  (await readNameBox(surface)) === range &&
  !describesSelection(await readLabel(surface), range);

/**
 * Selects a cell or range through the Name Box and waits until the readout confirms it. It
 * changes nothing in the sheet, so if the selection doesn't take, it's simply done again.
 */
export const select = async (
  surface: Surface,
  range: RangeAddress,
  triesLeft = surface.timing.selectTries,
): Promise<void> => {
  if (await isUnchangedSelection(surface, range)) await goTo(surface, cellBelow(range));
  await goTo(surface, range);
  const selected = await until(
    surface,
    () => readLabel(surface),
    (label) => describesSelection(label, range),
  );
  if (selected.accepted) return;
  if (triesLeft > 1) return select(surface, range, triesLeft - 1);
  throw new Error(`Selecting ${range} left the readout at ${JSON.stringify(selected.last)}.`);
};

/** Selects a cell and reads what the formula bar and the readout say about it. A read. */
export const readCell = async (surface: Surface, cell: CellAddress): Promise<CellObservation> => {
  await select(surface, cell);
  const label = await readLabel(surface);
  const readout = parseReadout(label, cell);
  if (readout === null)
    throw new Error(`The readout did not describe ${cell}: ${JSON.stringify(label)}.`);
  const raw = (await surface.frame.locator(surface.selectors.formulaBar).textContent()) ?? '';
  return { raw, display: readout.display, annotations: [...readout.annotations] };
};

/**
 * Types into the selected cell, which replaces its content, and checks the text reached the
 * cell editor before anything is committed. Keystrokes sent while the editor is starting can
 * be dropped; on a mismatch, Escape cancels the edit and the text is typed again.
 */
const type = async (
  surface: Surface,
  text: string,
  trace: Trace,
  triesLeft = surface.timing.typingTries,
): Promise<void> => {
  await surface.frame.locator(surface.selectors.cellEditor).focus();
  await surface.page.keyboard.type(text);
  const typed = await until(
    surface,
    () => readCellEditor(surface),
    (shown) => shown === text,
  );
  if (typed.accepted) return;
  await surface.page.keyboard.press(KEYS.cancel);
  if (triesLeft <= 1) {
    throw new Error(`The cell editor showed ${JSON.stringify(typed.last)} after typing.`);
  }
  trace('sheet.retry', { action: 'type', reason: 'keystrokes were dropped', shown: typed.last });
  return type(surface, text, trace, triesLeft - 1);
};

/**
 * Enters text in a cell, as a person does: select it, type, press Enter. Enter moves the
 * selection to the cell below, and afterwards the selection is left there, as it would be for a
 * person. The entry changes the undo history, so it's repeated only when it provably didn't
 * commit: the cell was empty before and is still empty after non-blank text was entered.
 */
export const enter = async (
  surface: Surface,
  cell: CellAddress,
  text: string,
  trace: Trace,
  triesLeft = surface.timing.commitTries,
): Promise<void> => {
  const before = await readCell(surface, cell);
  await type(surface, text, trace);
  await surface.page.keyboard.press(KEYS.commit);
  const below = cellBelow(cell);
  const moved = await until(
    surface,
    () => readNameBox(surface),
    (address) => address === below,
  );
  if (!moved.accepted) await surface.page.keyboard.press(KEYS.cancel);
  const after = await readCell(surface, cell);

  if (before.raw === '' && after.raw === '' && text.trim() !== '') {
    if (triesLeft <= 1) throw new Error(`${cell} stayed empty after every try.`);
    trace('sheet.retry', { action: 'enter', cell, reason: 'the cell is still empty' });
    return enter(surface, cell, text, trace, triesLeft - 1);
  }
  if (!moved.accepted) {
    throw new Error(`The selection stayed at ${moved.last} instead of moving to ${below}.`);
  }
  if (before.raw !== '' && after.raw === before.raw) {
    // Either the entry was lost or it normalised to the same content, as `1.0` over `1` does.
    trace('sheet.entry.unchanged', { cell, text, raw: after.raw });
  }
  await select(surface, below);
};

/**
 * Types text and presses Ctrl+Enter, which puts it in every selected cell as one change. It
 * changes the undo history and can't be checked without moving the selection, so it's done once.
 */
export const enterInSelection = async (
  surface: Surface,
  text: string,
  trace: Trace,
): Promise<void> => {
  await type(surface, text, trace);
  await surface.page.keyboard.press(KEYS.enterInSelection);
  await surface.page.waitForTimeout(surface.timing.settleMs);
};
