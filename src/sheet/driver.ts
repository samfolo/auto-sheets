/**
 * A Driver for any spreadsheet that exposes Excel's accessible controls. A target (Excel, or
 * the clone) only says how to open a sheet and where its controls are; everything a step does
 * is defined once, in actions.ts, so both targets are driven the same way.
 */
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { screenshot } from '../browser/index.ts';
import { formatStep } from './steps.ts';
import type {
  ActionStep,
  CellAddress,
  CellObservation,
  PointerStep,
  SelectionObservation,
} from './contract.ts';
import { measureGrid, pointAndWait, type GridGeometry } from './pointer.ts';
import {
  displayPath,
  attempt,
  PROJECT,
  fail,
  ok,
  type Result,
  type Trace,
  unreachable,
} from '../kernel/index.ts';
import {
  enter,
  enterInSelection,
  press,
  readCell,
  readSelection,
  select,
  typeAndCommit,
} from './actions.ts';
import { HELD_KEY_CODES, KEYS } from './keys.ts';
import type { Surface } from './surface.ts';

/**
 * What the factory needs from any system it runs cases on: Excel, or a clone. Steps are
 * performed one at a time, and observing a cell is the one step that reads, so the same case
 * runs on either system.
 */
export interface Driver {
  /** The system being driven, as named in reports. */
  readonly target: string;
  /** Describes the system and its regional format, for reference.json. */
  readonly environment: string;
  /** Opens a new sheet: blank, or from a seed workbook on disk. Every case starts here. */
  readonly open: (seed: string | null) => Promise<Result<void>>;
  /** Does one thing a person does, such as entering text or pressing undo. */
  readonly perform: (step: ActionStep) => Promise<Result<void>>;
  /** Selects the cell and reads what the formula bar and the cell show. */
  readonly observe: (cell: CellAddress) => Promise<Result<CellObservation>>;
  /** Reads the selection without changing it. */
  readonly observeSelection: () => Promise<Result<SelectionObservation>>;
  /** Saves a picture of the sheet as a person sees it, for review. Returns the file. */
  readonly capture: (file: string) => Promise<Result<string>>;
}

/** What a target provides so the sheet driver can run on it. */
export interface SheetTarget {
  /** How reports name it, such as `excel`. */
  readonly name: string;
  /** The product and regional format, recorded in reference.json. */
  readonly environment: string;
  /** Opens a new sheet, blank or from a seed workbook on disk, and returns where it is. */
  readonly open: (seed: string | null) => Promise<Surface>;
  /** Finds a sheet that is already open, so step-by-step commands can continue on it. */
  readonly findOpen: () => Promise<Surface | null>;
}

/** The pointer steps, which need the grid measured first. */
const POINTER_STEPS: ReadonlySet<string> = new Set([
  'click',
  'double-click',
  'drag',
  'click-column',
  'click-row',
  'drag-columns',
  'drag-rows',
  'click-corner',
] satisfies PointerStep['do'][]);

const isPointerStep = (step: ActionStep): step is PointerStep => POINTER_STEPS.has(step.do);

const performStep = (surface: Surface, step: ActionStep, trace: Trace): Promise<void> => {
  switch (step.do) {
    case 'select':
      return select(surface, step.range);
    case 'enter':
      return enter(surface, step.cell, step.text, trace);
    case 'enter-in-selection':
      return enterInSelection(surface, step.text, trace);
    case 'clear':
      return press(surface, KEYS.clear);
    case 'fill-down':
      return press(surface, KEYS.fillDown);
    case 'copy':
      return press(surface, KEYS.copy);
    case 'paste':
      return press(surface, KEYS.paste);
    case 'undo':
      return press(surface, KEYS.undo);
    case 'redo':
      return press(surface, KEYS.redo);
    case 'type':
      return typeAndCommit(surface, step.text);
    case 'press':
      return press(
        surface,
        [...(step.hold ?? []).map((key) => HELD_KEY_CODES[key]), step.key].join('+'),
      );
    case 'select-all':
      return press(surface, KEYS.selectAll);
    case 'click':
    case 'double-click':
    case 'drag':
    case 'click-column':
    case 'click-row':
    case 'drag-columns':
    case 'drag-rows':
    case 'click-corner':
      throw new Error(`${step.do} needs the grid's geometry; the driver measures it first.`);
    default:
      return unreachable(step);
  }
};

/** A failed action, with a screenshot of what the page looked like at the time. */
const actionFailed = async (surface: Surface, action: string, reason: string) => {
  const shot = await screenshot(surface.page, 'action-failure');
  return fail('BROWSER_ACTION_FAILED', `Could not ${action}.`, {
    details: [reason, ...(shot.success ? [`screenshot: ${displayPath(shot.data)}`] : [])],
  });
};

export const createSheetDriver = (target: SheetTarget, trace: Trace): Driver => {
  const state: { surface: Surface | null; grid: GridGeometry | null } = {
    surface: null,
    grid: null,
  };

  /**
   * The grid's geometry, measured once: every sheet a target opens is laid out alike. Measuring
   * clicks cells, so the active cell is put back afterwards; otherwise a case's first run would
   * start from wherever the measuring stopped, and its second from a new sheet's A1.
   */
  const gridOf = async (surface: Surface): Promise<GridGeometry> => {
    if (state.grid === null) {
      const active = await surface.frame.locator(surface.selectors.nameBox).inputValue();
      state.grid = await measureGrid(surface);
      await select(surface, active);
    }
    if (state.grid === null) throw new Error('Could not find the grid to measure it.');
    trace('sheet.grid', { target: target.name, ...state.grid });
    return state.grid;
  };

  const currentSurface = async (): Promise<Result<Surface>> => {
    state.surface ??= await target.findOpen();
    return state.surface === null
      ? fail('BROWSER_ACTION_FAILED', `No ${target.name} sheet is open.`, {
          hint: `Run \`${PROJECT.cli} ${target.name} open\` first.`,
        })
      : ok(state.surface);
  };

  /** Runs one action on the open sheet, tracing it and turning a throw into a Result. */
  const act = async <T>(action: string, run: (surface: Surface) => Promise<T>) => {
    const surface = await currentSurface();
    if (!surface.success) return surface;
    const started = performance.now();
    const result = await attempt(
      () => run(surface.data),
      (reason) => actionFailed(surface.data, action, reason),
    );
    trace('sheet.action', {
      target: target.name,
      action,
      success: result.success,
      durationMs: Math.round(performance.now() - started),
    });
    return result;
  };

  return {
    target: target.name,
    environment: target.environment,

    open: async (seed) => {
      const opened = await attempt(
        () => target.open(seed),
        (reason) =>
          fail('BROWSER_ACTION_FAILED', `Could not open a ${seed ? 'seeded' : 'blank'} sheet.`, {
            details: [reason],
          }),
      );
      trace('sheet.open', { target: target.name, seed, success: opened.success });
      if (!opened.success) return opened;
      state.surface = opened.data;
      return ok(undefined);
    },

    perform: (step) =>
      act(formatStep(step), async (surface) =>
        isPointerStep(step)
          ? pointAndWait(surface, await gridOf(surface), step, trace)
          : performStep(surface, step, trace),
      ),

    observe: (cell) => act(`observe ${cell}`, (surface) => readCell(surface, cell)),

    observeSelection: () => act('observe the selection', readSelection),

    capture: (file) =>
      act('capture', async ({ page }) => {
        await mkdir(dirname(file), { recursive: true });
        await page.screenshot({ path: file });
        return file;
      }),
  };
};
