import type { Driver } from '../cases/driver.ts';
import type { CellAddress } from '../contracts/case.ts';
import { fail, ok } from '../core/result.ts';

type Sheet = Readonly<Record<CellAddress, string>>;

/**
 * An in-memory stand-in for a spreadsheet, for testing the case machinery without a browser.
 * It stores exactly what was typed and shows it unchanged, with undo and redo. Entering in a
 * cell listed in `failOn` fails, to exercise error reporting.
 */
export const createFakeDriver = ({ failOn = [] }: { failOn?: readonly CellAddress[] } = {}) => {
  const state: { sheet: Sheet; undone: Sheet[]; history: Sheet[] } = {
    sheet: {},
    undone: [],
    history: [],
  };
  const driver: Driver = {
    target: 'fake',
    environment: 'in-memory fake',
    openBlank: async () => {
      Object.assign(state, { sheet: {}, undone: [], history: [] });
      return ok(undefined);
    },
    enter: async (cell, text) => {
      if (failOn.includes(cell))
        return fail('BROWSER_ACTION_FAILED', `Could not enter in ${cell}.`);
      state.history.push(state.sheet);
      state.undone = [];
      state.sheet = { ...state.sheet, [cell]: text };
      return ok(undefined);
    },
    undo: async () => {
      const previous = state.history.pop();
      if (previous !== undefined) {
        state.undone.push(state.sheet);
        state.sheet = previous;
      }
      return ok(undefined);
    },
    redo: async () => {
      const next = state.undone.pop();
      if (next !== undefined) {
        state.history.push(state.sheet);
        state.sheet = next;
      }
      return ok(undefined);
    },
    observe: async (cell) => {
      const raw = state.sheet[cell] ?? '';
      return ok({ raw, display: raw, annotations: [] });
    },
  };
  return driver;
};
