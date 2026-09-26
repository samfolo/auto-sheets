/**
 * Using a sheet with the mouse, the same way on every target. Excel draws its grid on a canvas
 * and a clone may draw it any way it likes, so the driver doesn't read where cells are: it
 * measures. It clicks points spread across the grid and reads the Name Box to learn which cell
 * each one fell in, then finds the one cell size and origin that put every point in its cell,
 * like reading a vernier. With uniform cells, as in a new sheet, that gives the whole grid, and
 * the headers and the corner lie before it.
 *
 * The points are far apart, so no two clicks read as a double-click, and each lands in a new
 * cell, so the Name Box always changes. Clicking only changes the selection, so measuring is
 * safe to repeat; it is done once per driver, before its first pointer step.
 */
import { columnNumber, positionOf, type Position } from './address.ts';
import type { CellAddress, PointerStep } from './contract.ts';
import { poll } from '../kernel/index.ts';
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

/** Where a probe was along one axis, and which column or row the sheet said it was in. */
interface Sample {
  readonly at: number;
  readonly index: number;
}

/**
 * Where the probes go, as fractions of the grid across and down. Each probe reads a column and a
 * row, so the points vary in both directions, following the golden-ratio sequences that spread
 * points most evenly without repeating a pattern. They keep clear of the grid's edges, where the
 * headers are, and each point lands far from the one before.
 */
const PROBES = 16;
const GOLDEN = { across: 0.618_034, down: 0.754_878 };
const MARGIN = { start: 0.1, span: 0.85 };
const spread = (step: number, ratio: number): number =>
  MARGIN.start + MARGIN.span * ((0.5 + step * ratio) % 1);

/** The sizes a cell may have, in pixels, and how finely to try them. */
const CELL_SIZES = { smallest: 8, largest: 400, step: 0.5 };

/** Every size to try, from the smallest to the largest. */
const SIZES = Array.from(
  { length: (CELL_SIZES.largest - CELL_SIZES.smallest) / CELL_SIZES.step + 1 },
  (_, step) => CELL_SIZES.smallest + step * CELL_SIZES.step,
);

/**
 * The size and origin of evenly spaced cells that put every sample in the cell it read. For each
 * size, each sample bounds the origin from both sides, and the size fits if the bounds leave
 * room. Of the sizes that fit, the middle one is taken, with the middle of its origins.
 */
const fitAxis = (samples: readonly Sample[]): { origin: number; size: number } | null => {
  const fits = SIZES.flatMap((size) => {
    const lowest = Math.max(...samples.map(({ at, index }) => at - index * size));
    const highest = Math.min(...samples.map(({ at, index }) => at - (index - 1) * size));
    return lowest < highest ? [{ origin: (lowest + highest) / 2, size }] : [];
  });
  return fits[Math.floor(fits.length / 2)] ?? null;
};

/** Clicks each point in turn and reads where the sheet says it landed; null if any can't be read. */
const probeAll = async (surface: Surface, points: readonly Point[]): Promise<Position[] | null> => {
  const [first, ...rest] = points;
  if (first === undefined) return [];
  const position = await probe(surface, first);
  if (position === null) return null;
  const others = await probeAll(surface, rest);
  return others === null ? null : [position, ...others];
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
  const points = Array.from({ length: PROBES }, (_, step) => ({
    x: left + (right - left) * spread(step + 1, GOLDEN.across),
    y: top + (bottom - top) * spread(step + 1, GOLDEN.down),
  }));
  const seen = await probeAll(surface, points);
  if (seen === null) return null;
  const columns = fitAxis(points.map(({ x }, i) => ({ at: x, index: seen[i]?.column ?? 0 })));
  const rows = fitAxis(points.map(({ y }, i) => ({ at: y, index: seen[i]?.row ?? 0 })));
  if (columns === null || rows === null) return null;
  return {
    originX: columns.origin,
    originY: rows.origin,
    cellWidth: columns.size,
    cellHeight: rows.size,
    left,
    top,
  };
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

/** Presses at one point, moves to another in a few steps, and releases. */
const drag = async (surface: Surface, from: Point, to: Point): Promise<void> => {
  const { mouse } = surface.page;
  await mouse.move(from.x, from.y);
  await mouse.down();
  await mouse.move(to.x, to.y, { steps: DRAG_MOVES });
  await mouse.up();
};

/** Does one pointer step on a measured grid. */
export const point = async (
  surface: Surface,
  grid: GridGeometry,
  step: PointerStep,
): Promise<void> => {
  const { mouse } = surface.page;
  switch (step.do) {
    case 'click': {
      const { x, y } = cellCentre(grid, step.cell);
      return mouse.click(x, y);
    }
    case 'double-click': {
      const { x, y } = cellCentre(grid, step.cell);
      return mouse.dblclick(x, y);
    }
    case 'drag':
      return drag(surface, cellCentre(grid, step.from), cellCentre(grid, step.to));
    case 'click-column': {
      const { x, y } = columnHeader(grid, step.column);
      return mouse.click(x, y);
    }
    case 'click-row': {
      const { x, y } = rowHeader(grid, step.row);
      return mouse.click(x, y);
    }
    case 'drag-columns':
      return drag(surface, columnHeader(grid, step.from), columnHeader(grid, step.to));
    case 'drag-rows':
      return drag(surface, rowHeader(grid, step.from), rowHeader(grid, step.to));
    case 'click-corner':
      return mouse.click(
        grid.originX - (grid.originX - grid.left) * CORNER_DEPTH,
        grid.originY - (grid.originY - grid.top) * CORNER_DEPTH,
      );
    default:
      return step satisfies never;
  }
};
