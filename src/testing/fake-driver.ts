import {
  type Driver,
  type ActionStep,
  type CellAddress,
  type RangeAddress,
  cellBelow,
  cellsIn,
} from '../sheet/index.ts';
import { fail, ok, type Result } from '../kernel/index.ts';

type Sheet = Readonly<Record<CellAddress, string>>;

interface FakeState {
  sheet: Sheet;
  selection: RangeAddress;
  history: Sheet[];
  undone: Sheet[];
}

const BLANK: FakeState = { sheet: {}, selection: 'A1', history: [], undone: [] };

/** Applies one change to the sheet as a single step in the undo history. */
const change = (state: FakeState, next: Sheet): void => {
  state.history.push(state.sheet);
  state.undone = [];
  state.sheet = next;
};

const fillSelection = (state: FakeState, text: string | undefined): Sheet =>
  Object.fromEntries(
    Object.entries(state.sheet)
      .filter(([cell]) => !cellsIn(state.selection).includes(cell))
      .concat(text === undefined ? [] : cellsIn(state.selection).map((cell) => [cell, text])),
  );

/**
 * An in-memory stand-in for a spreadsheet, for testing the case machinery without a browser. It
 * stores exactly what was typed and shows it unchanged, with a selection, undo and redo. Steps it
 * doesn't model, such as fill-down, fail. Entering in a cell listed in `failOn` fails too.
 */
export const createFakeDriver = ({ failOn = [] }: { failOn?: readonly CellAddress[] } = {}) => {
  const state: FakeState = { ...BLANK };

  const apply = (step: ActionStep): Result<void> => {
    switch (step.do) {
      case 'select':
        state.selection = step.range;
        return ok(undefined);
      case 'enter':
        if (failOn.includes(step.cell)) {
          return fail('BROWSER_ACTION_FAILED', `Could not enter in ${step.cell}.`);
        }
        change(state, { ...state.sheet, [step.cell]: step.text });
        state.selection = cellBelow(step.cell);
        return ok(undefined);
      case 'enter-in-selection':
        change(state, fillSelection(state, step.text));
        return ok(undefined);
      case 'clear':
        change(state, fillSelection(state, undefined));
        return ok(undefined);
      case 'undo': {
        const previous = state.history.pop();
        if (previous !== undefined)
          [state.undone, state.sheet] = [[...state.undone, state.sheet], previous];
        return ok(undefined);
      }
      case 'redo': {
        const next = state.undone.pop();
        if (next !== undefined)
          [state.history, state.sheet] = [[...state.history, state.sheet], next];
        return ok(undefined);
      }
      default:
        return fail('BROWSER_ACTION_FAILED', `The fake driver does not model ${step.do}.`);
    }
  };

  const driver: Driver = {
    target: 'fake',
    environment: 'in-memory fake',
    open: async () => {
      Object.assign(state, BLANK, { history: [], undone: [] });
      return ok(undefined);
    },
    perform: async (step) => apply(step),
    observe: async (cell) => {
      const raw = state.sheet[cell] ?? '';
      return ok({ raw, display: raw, annotations: [] });
    },
  };
  return driver;
};
