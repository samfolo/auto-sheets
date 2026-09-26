/**
 * A Driver for any spreadsheet that exposes Excel's accessible controls. A target (Excel, or
 * the clone) only says how to open a sheet and where its controls are; everything a step does
 * is defined once, in actions.ts, so both targets are driven the same way.
 */
import { screenshot } from '../browser/inspect.ts';
import type { Driver } from '../cases/driver.ts';
import { formatStep } from '../cases/steps.ts';
import type { ActionStep } from '../contracts/case.ts';
import { displayPath } from '../contracts/files.ts';
import { attempt } from '../core/attempt.ts';
import { PROJECT } from '../core/project.ts';
import { fail, ok, type Result } from '../core/result.ts';
import type { Trace } from '../core/telemetry.ts';
import { unreachable } from '../core/unreachable.ts';
import { enter, enterInSelection, press, readCell, select } from './actions.ts';
import { KEYS } from './keys.ts';
import type { Surface } from './surface.ts';

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
  const state: { surface: Surface | null } = { surface: null };

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

    perform: (step) => act(formatStep(step), (surface) => performStep(surface, step, trace)),

    observe: (cell) => act(`observe ${cell}`, (surface) => readCell(surface, cell)),
  };
};
