/**
 * Using a sheet with the mouse, the same way on every target. Excel draws its grid on a canvas
 * and a clone may draw it any way it likes, so the driver doesn't read where cells are: it
 * measures, by clicking and reading the Name Box to learn which cell a point is in. On each axis,
 * two binary searches find the exact pixel where a column (or row) begins, one near each end of
 * the grid. Two exact edges a known number of cells apart give the cell size and the grid's
 * origin, and the headers and the corner lie before it.
 *
 * The four searches take turns, so consecutive clicks are always far apart and never read as a
 * double-click. Clicking only changes the selection, so measuring is safe to repeat; the driver
 * does it once, before its first pointer step, and puts the active cell back afterwards.
 */
import { columnNumber, positionOf, type Position } from './address.ts';
import type { CellAddress, HELD_KEYS, PointerStep, PointerTarget } from './contract.ts';

type HeldKey = (typeof HELD_KEYS)[number];
import { poll, type Trace } from '../kernel/index.ts';
import type { Surface } from './surface.ts';

/** Where the grid's cells are, in the page's coordinates. */
export interface GridGeometry {
  /** The top-left corner of cell A1. */
  readonly originX: number;
  readonly originY: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** The top-left corner of the whole grid, headers included: the select-all corner. */
  readonly left: number;
  readonly top: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** The midpoint of a stretch of cells, counted from 1, along one axis. */
const centre = (origin: number, size: number, index: number): number =>
  origin + (index - 1) * size + size / 2;

/** How far into the corner the select-all target sits: Excel draws it at the corner's far end. */
const CORNER_DEPTH = 0.2;

/**
 * How many settle times a probe waits for the Name Box to change. Excel's takes about 700 ms after
 * a click, a little more than its settle time.
 */
const PROBE_SETTLES = 2;

/** How many moves a drag makes between pressing and releasing, as a hand would. */
const DRAG_MOVES = 5;

/**
 * Clicks a point and reads which cell the sheet then says is active. The Name Box can lag the
 * click, so it waits for the Name Box to change, or for the sheet's settle time when the click
 * lands in the cell that was already active.
 */
const probe = async (surface: Surface, point: Point): Promise<Position | null> => {
  const nameBox = surface.frame.locator(surface.selectors.nameBox);
  const before = await nameBox.inputValue();
  await surface.page.mouse.click(point.x, point.y);
  const { last } = await poll(
    () => nameBox.inputValue(),
    (value) => value !== before,
    { timeoutMs: surface.timing.settleMs * PROBE_SETTLES, intervalMs: surface.timing.pollMs },
  );
  const position = positionOf(last);
  return position.row === 0 ? null : position;
};

/** Which axis a search runs along, and how to read a position on it. */
interface Axis {
  /** A point on the axis at a given coordinate. */
  readonly at: (coordinate: number) => Point;
  /** The column or row number a position is in. */
  readonly index: (position: Position) => number;
}

/**
 * One binary search for the first coordinate in [low, high] that lands in the same column or row
 * as `high`: the exact edge where that column or row begins.
 */
interface Search {
  readonly axis: Axis;
  readonly low: number;
  readonly high: number;
  /** The column or row at `high`, once read. */
  readonly target: number | null;
}

/** A point a fraction of the way from one coordinate to another, on a whole pixel. */
const within = (start: number, end: number, fraction: number): number =>
  Math.round(start + (end - start) * fraction);

/**
 * Where each axis's two searches run, as fractions of the grid: one near each end, clear of the
 * window's edges, where a product can draw bars over its grid (Excel's sheet tabs and status bar).
 */
const SEARCH_REGIONS = [
  { from: 0.1, to: 0.35 },
  { from: 0.55, to: 0.8 },
] as const;

/** Takes one step of a search: the first reads its target, each later one halves its range. */
const advance = async (surface: Surface, search: Search): Promise<Search | null> => {
  const { axis, low, high, target } = search;
  if (target === null) {
    const position = await probe(surface, axis.at(high));
    return position === null ? null : { ...search, target: axis.index(position) };
  }
  const middle = Math.floor((low + high) / 2);
  const position = await probe(surface, axis.at(middle));
  if (position === null) return null;
  return axis.index(position) >= target
    ? { ...search, high: middle }
    : { ...search, low: middle + 1 };
};

const finished = (search: Search): boolean => search.target !== null && search.low >= search.high;

/**
 * Runs the searches together, one step of each in turn, so that no two consecutive clicks are
 * close. Returns each search finished, or null if the sheet couldn't be read.
 */
const searchTogether = async (
  surface: Surface,
  searches: readonly Search[],
): Promise<Search[] | null> => {
  if (searches.every(finished)) return [...searches];
  const next: Search[] = [];
  for (const search of searches) {
    // One click at a time, taking turns between the searches.
    // oxlint-disable-next-line no-await-in-loop
    const stepped = finished(search) ? search : await advance(surface, search);
    if (stepped === null) return null;
    next.push(stepped);
  }
  return searchTogether(surface, next);
};

/** The size and origin of evenly spaced cells, from two exact edges a known number of cells apart. */
const fromEdges = (near: Search, far: Search): { origin: number; size: number } | null => {
  if (near.target === null || far.target === null || far.target <= near.target) return null;
  const size = (far.low - near.low) / (far.target - near.target);
  return { origin: near.low - (near.target - 1) * size, size };
};

/** Measures the grid of the open sheet. Returns null if the grid can't be found or read. */
export const measureGrid = async (surface: Surface): Promise<GridGeometry | null> => {
  const boxes = await Promise.all(
    (await surface.frame.locator(surface.selectors.grid).all()).map((part) => part.boundingBox()),
  );
  const visible = boxes.filter((box) => box !== null && box.width > 1 && box.height > 1);
  if (visible.length === 0) return null;
  const left = Math.min(...visible.map((box) => box?.x ?? 0));
  const top = Math.min(...visible.map((box) => box?.y ?? 0));
  // Only what's on screen can be clicked, and a grid may draw beyond it.
  const viewport =
    surface.page.viewportSize() ??
    (await surface.page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  const right = Math.min(
    viewport.width - 1,
    Math.max(...visible.map((box) => (box?.x ?? 0) + (box?.width ?? 0))),
  );
  const bottom = Math.min(
    viewport.height - 1,
    Math.max(...visible.map((box) => (box?.y ?? 0) + (box?.height ?? 0))),
  );
  const across: Axis = {
    at: (x) => ({ x, y: Math.round((top + bottom) / 2) }),
    index: ({ column }) => column,
  };
  const down: Axis = {
    at: (y) => ({ x: Math.round((left + right) / 2), y }),
    index: ({ row }) => row,
  };
  const searches = SEARCH_REGIONS.flatMap(({ from, to }) => [
    { axis: across, low: within(left, right, from), high: within(left, right, to), target: null },
    { axis: down, low: within(top, bottom, from), high: within(top, bottom, to), target: null },
  ]);
  const done = await searchTogether(surface, searches);
  if (done === null) return null;
  const [nearColumn, nearRow, farColumn, farRow] = done;
  if (!nearColumn || !nearRow || !farColumn || !farRow) return null;
  const columns = fromEdges(nearColumn, farColumn);
  const rows = fromEdges(nearRow, farRow);
  if (columns === null || rows === null) return null;
  const grid = {
    originX: columns.origin,
    originY: rows.origin,
    cellWidth: columns.size,
    cellHeight: rows.size,
    left,
    top,
  };
  return (await confirms(surface, grid, farColumn, farRow)) ? grid : null;
};

/**
 * Whether a measurement holds: clicking the predicted middle of the far cell must select it. A
 * search misled by something drawn over the grid fails here, rather than aiming every later
 * click wrong.
 */
const confirms = async (
  surface: Surface,
  grid: GridGeometry,
  column: Search,
  row: Search,
): Promise<boolean> => {
  if (column.target === null || row.target === null) return false;
  const position = await probe(surface, {
    x: centre(grid.originX, grid.cellWidth, column.target),
    y: centre(grid.originY, grid.cellHeight, row.target),
  });
  return position?.column === column.target && position.row === row.target;
};

/** The middle of a cell. */
const cellCentre = (grid: GridGeometry, cell: CellAddress): Point => {
  const position = positionOf(cell);
  return {
    x: centre(grid.originX, grid.cellWidth, position.column),
    y: centre(grid.originY, grid.cellHeight, position.row),
  };
};

/** The middle of a column's header, in the band above the first row. */
const columnHeader = (grid: GridGeometry, column: string): Point => ({
  x: centre(grid.originX, grid.cellWidth, columnNumber(column)),
  y: (grid.top + grid.originY) / 2,
});

/** The middle of a row's header, in the band left of the first column. */
const rowHeader = (grid: GridGeometry, row: number): Point => ({
  x: (grid.left + grid.originX) / 2,
  y: centre(grid.originY, grid.cellHeight, row),
});

/** Where a pointer target is: a cell's middle, or the middle of a column's or a row's header. */
const targetPoint = (grid: GridGeometry, target: PointerTarget): Point => {
  if (typeof target === 'number') return rowHeader(grid, target);
  return /\d/.test(target) ? cellCentre(grid, target) : columnHeader(grid, target);
};

/** The key each held key presses: Command on a Mac is Control elsewhere, as Playwright maps it. */
const KEY_FOR: Readonly<Record<HeldKey, string>> = { Shift: 'Shift', Command: 'ControlOrMeta' };

/** Does a gesture with keys held down, releasing them afterwards whatever happens. */
const holding = async (
  surface: Surface,
  keys: readonly HeldKey[] | undefined,
  gesture: () => Promise<void>,
): Promise<void> => {
  const { keyboard } = surface.page;
  for (const key of keys ?? []) {
    // Keys go down in order, as a hand presses them.
    // oxlint-disable-next-line no-await-in-loop
    await keyboard.down(KEY_FOR[key]);
  }
  try {
    await gesture();
  } finally {
    for (const key of [...(keys ?? [])].toReversed()) {
      // oxlint-disable-next-line no-await-in-loop
      await keyboard.up(KEY_FOR[key]);
    }
  }
};

/** Presses at one point, moves to another in a few steps, and releases. */
const drag = async (surface: Surface, from: Point, to: Point): Promise<void> => {
  const { mouse } = surface.page;
  await mouse.move(from.x, from.y);
  await mouse.down();
  await mouse.move(to.x, to.y, { steps: DRAG_MOVES });
  await mouse.up();
};

/** What the sheet says about the selection: the Name Box and the readout together. */
const selectionText = async ({ frame, selectors }: Surface): Promise<string> =>
  `${await frame.locator(selectors.nameBox).inputValue()} | ${
    (await frame.locator(selectors.readout).first().getAttribute('aria-label')) ?? ''
  }`;

/**
 * Waits until the selection has changed from `before` and then held still for the sheet's settle
 * time, or until the step's time is up. Excel updates the Name Box before the readout, so the
 * first change isn't the end of it.
 */
const waitUntilSettled = async (surface: Surface, before: string): Promise<boolean> => {
  const { actionMs, pollMs, settleMs } = surface.timing;
  const deadline = performance.now() + actionMs;
  const watch = async (last: string, stillSince: number): Promise<boolean> => {
    await surface.page.waitForTimeout(pollMs);
    const now = await selectionText(surface);
    const time = performance.now();
    if (now !== before && now === last && time - stillSince >= settleMs) return true;
    if (time >= deadline) return now !== before;
    return watch(now, now === last ? stillSince : time);
  };
  return watch(before, performance.now());
};

/**
 * Whether a step may be repeated when it changed nothing. A click or drag with no key held only
 * sets the selection, so doing it again gives the same result. With a key held it may toggle
 * the selection back, and a double-click starts editing, so those are never repeated.
 */
const repeatable = (step: PointerStep): boolean =>
  step.do !== 'double-click' && !('hold' in step && step.hold !== undefined);

/**
 * Does one pointer step, then waits for the sheet to show its effect, so the next step sees what
 * a person would. A step that may be repeated and changed nothing is done once more, since a
 * sheet that has only just opened can miss a gesture; each repeat is traced.
 */
export const pointAndWait = async (
  surface: Surface,
  grid: GridGeometry,
  step: PointerStep,
  trace: Trace,
): Promise<void> => {
  const before = await selectionText(surface);
  await point(surface, grid, step);
  if ((await waitUntilSettled(surface, before)) || !repeatable(step)) return;
  trace('sheet.retry', { step: step.do, reason: 'the selection did not change' });
  await point(surface, grid, step);
  await waitUntilSettled(surface, before);
};

/** Does one pointer step on a measured grid. */
const point = async (surface: Surface, grid: GridGeometry, step: PointerStep): Promise<void> => {
  const { mouse } = surface.page;
  const click = ({ x, y }: Point) => mouse.click(x, y);
  switch (step.do) {
    case 'click':
      return holding(surface, step.hold, () => click(cellCentre(grid, step.cell)));
    case 'double-click': {
      const { x, y } = cellCentre(grid, step.cell);
      return mouse.dblclick(x, y);
    }
    case 'drag':
      return holding(surface, step.hold, () =>
        drag(surface, targetPoint(grid, step.from), targetPoint(grid, step.to)),
      );
    case 'click-column':
      return holding(surface, step.hold, () => click(columnHeader(grid, step.column)));
    case 'click-row':
      return holding(surface, step.hold, () => click(rowHeader(grid, step.row)));
    case 'drag-columns':
      return drag(surface, columnHeader(grid, step.from), columnHeader(grid, step.to));
    case 'drag-rows':
      return drag(surface, rowHeader(grid, step.from), rowHeader(grid, step.to));
    case 'click-corner':
      return click({
        x: grid.originX - (grid.originX - grid.left) * CORNER_DEPTH,
        y: grid.originY - (grid.originY - grid.top) * CORNER_DEPTH,
      });
    default:
      return step satisfies never;
  }
};
