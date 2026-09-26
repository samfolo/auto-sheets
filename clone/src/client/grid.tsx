/**
 * The grid: column headers, row headers and the cells, drawn as a table so every cell can be
 * clicked, dragged and read. All gestures are sent to the server, which owns the selection.
 */
import * as React from 'react';
import type { JSX } from 'react';
import { MAX_COLS, MAX_ROWS, columnLetter, parseArea, type Rect } from '../engine/address.js';
import type { SessionState } from '../engine/session.js';
import {
  COL_WIDTH,
  HEADER_HEIGHT,
  HEADER_WIDTH,
  ROW_HEIGHT,
  VISIBLE_COLS,
  VISIBLE_ROWS,
} from './theme';
import { useGestures, type GestureHandlers } from './use-gestures';
import styles from './grid.module.css';

/** What the grid needs from the screen. */
export interface GridProps {
  state: SessionState | null;
  call: (type: string, body?: Record<string, unknown>) => Promise<void>;
  onEditStart: (raw: string) => void;
  onGesture: () => void;
}

const inRect = (rect: Rect, col: number, row: number): boolean =>
  col >= rect.c1 && col <= rect.c2 && row >= rect.r1 && row <= rect.r2;

const cellClass = (
  view: SessionState['cells'][number] | undefined,
  selected: boolean,
  active: boolean,
): string => {
  const classes = [styles.cell];
  if (selected) classes.push(styles.cellSelected);
  if (active) classes.push(styles.cellActive);
  if (view?.annotations.includes('Contains error')) classes.push(styles.cellError);
  if (view?.annotations.includes('The formula in this cell contains an error.'))
    classes.push(styles.cellBroken);
  if (view && view.display !== '' && /^-?[\d.,]+(%|E[+-]\d+)?$/.test(view.display))
    classes.push(styles.numeric);
  return classes.join(' ');
};

/** One cell of the sheet. */
const GridCell = ({
  address,
  view,
  selected,
  active,
  col,
  row,
  handlers,
  onEditStart,
}: {
  address: string;
  view: SessionState['cells'][number] | undefined;
  selected: boolean;
  active: boolean;
  col: number;
  row: number;
  handlers: GestureHandlers;
  onEditStart: (raw: string) => void;
}): JSX.Element => (
  <td
    data-address={address}
    aria-label={address}
    className={cellClass(view, selected, active)}
    style={{ height: ROW_HEIGHT }}
    onMouseDown={(event) => handlers.begin(event, { kind: 'cell', col, row })}
    onMouseOver={() => handlers.hover({ kind: 'cell', col, row })}
    onFocus={() => handlers.hover({ kind: 'cell', col, row })}
    onMouseUp={handlers.finish}
    onDoubleClick={() => onEditStart(view?.raw ?? '')}
  >
    {view?.display ?? ''}
  </td>
);

/** The corner that selects every cell. */
const SelectAllCorner = ({ onClick }: { onClick: () => void }): JSX.Element => (
  <th
    scope="col"
    className={styles.cornerCell}
    style={{ width: HEADER_WIDTH, height: HEADER_HEIGHT }}
  >
    <button
      type="button"
      className={styles.cornerButton}
      aria-label="Select all"
      onClick={onClick}
    />
  </th>
);

/** The column headers and the select-all corner. */
const GridHead = ({
  columns,
  selected,
  handlers,
  onCorner,
}: {
  columns: number[];
  selected: (col: number) => boolean;
  handlers: GestureHandlers;
  onCorner: () => void;
}): JSX.Element => (
  <thead>
    <tr style={{ height: HEADER_HEIGHT }}>
      <SelectAllCorner onClick={onCorner} />
      {columns.map((col) => (
        <th
          key={col}
          scope="col"
          data-col={columnLetter(col)}
          aria-label={columnLetter(col)}
          className={selected(col) ? styles.colHeaderSelected : styles.colHeader}
          onMouseDown={(event) => handlers.begin(event, { kind: 'column', col })}
          onMouseOver={() => handlers.hover({ kind: 'column', col })}
          onFocus={() => handlers.hover({ kind: 'column', col })}
          onMouseUp={handlers.finish}
        >
          {columnLetter(col)}
        </th>
      ))}
    </tr>
  </thead>
);

/** One row of cells with its row header. */
const SheetRow = ({
  row,
  columns,
  views,
  selected,
  activeRow,
  activeCol,
  headers,
  handlers,
  onEditStart,
}: {
  row: number;
  columns: number[];
  views: Map<string, SessionState['cells'][number]>;
  selected: (col: number, row: number) => boolean;
  activeRow: number;
  activeCol: number;
  headers: { selected: (row: number) => boolean };
  handlers: GestureHandlers;
  onEditStart: (raw: string) => void;
}): JSX.Element => (
  <tr style={{ height: ROW_HEIGHT }}>
    <th
      scope="row"
      data-row={row + 1}
      aria-label={String(row + 1)}
      className={headers.selected(row) ? styles.rowHeaderSelected : styles.rowHeader}
      onMouseDown={(event) => handlers.begin(event, { kind: 'row', row })}
      onMouseOver={() => handlers.hover({ kind: 'row', row })}
      onFocus={() => handlers.hover({ kind: 'row', row })}
      onMouseUp={handlers.finish}
    >
      {row + 1}
    </th>
    {columns.map((col) => {
      const address = `${columnLetter(col)}${row + 1}`;
      return (
        <GridCell
          key={address}
          address={address}
          view={views.get(address)}
          selected={selected(col, row)}
          active={col === activeCol && row === activeRow}
          col={col}
          row={row}
          handlers={handlers}
          onEditStart={onEditStart}
        />
      );
    })}
  </tr>
);

/** The grid of cells with its headers. */
export const Grid = ({ state, call, onEditStart, onGesture }: GridProps): JSX.Element => {
  const handlers = useGestures(call, onGesture);

  const selectedRects = (state?.selection.areas ?? []).map(parseArea);
  const activeRect = state ? parseArea(state.selection.active) : null;
  const views = new Map((state?.cells ?? []).map((cell) => [cell.address, cell]));
  const columns = Array.from({ length: VISIBLE_COLS }, (_, index) => index);
  const rows = Array.from({ length: VISIBLE_ROWS }, (_, index) => index);
  const columnSelected = (col: number): boolean =>
    selectedRects.some(
      (rect) => rect.r1 === 0 && rect.r2 === MAX_ROWS - 1 && col >= rect.c1 && col <= rect.c2,
    );
  const rowSelected = (row: number): boolean =>
    selectedRects.some(
      (rect) => rect.c1 === 0 && rect.c2 === MAX_COLS - 1 && row >= rect.r1 && row <= rect.r2,
    );

  return (
    <div id="grid" className={styles.grid}>
      <table className={styles.table}>
        <colgroup>
          <col style={{ width: HEADER_WIDTH }} />
          {columns.map((col) => (
            <col key={col} style={{ width: COL_WIDTH }} />
          ))}
        </colgroup>
        <GridHead
          columns={columns}
          selected={columnSelected}
          handlers={handlers}
          onCorner={() => {
            onGesture();
            void call('click-corner');
          }}
        />
        <tbody>
          {rows.map((row) => (
            <SheetRow
              key={row}
              row={row}
              columns={columns}
              views={views}
              selected={(col, atRow) => selectedRects.some((rect) => inRect(rect, col, atRow))}
              activeRow={activeRect?.r1 ?? 0}
              activeCol={activeRect?.c1 ?? 0}
              headers={{ selected: rowSelected }}
              handlers={handlers}
              onEditStart={onEditStart}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
