// The screen-reader readout and the Name Box text for a selection.

import { areaName, cellName, isSingleCell } from './address.ts';
import type { Selection } from './selection.ts';

export interface ReadoutCell {
  display: string;
  annotations: string[];
}

/** The Name Box always shows the active cell's address. */
export const nameBoxText = (sel: Selection): string => cellName(sel.active);

const annotated = (parts: string[], annotations: string[]): string =>
  [...parts, ...annotations].join(' . ') + ' . ';

/** The readout's aria-label, in Excel's exact format. */
export const readoutText = (sel: Selection, cell: ReadoutCell): string => {
  if (sel.editing) return 'Editing';
  const area = sel.areas[sel.areas.length - 1];
  if (sel.areas.length > 1) {
    const names = sel.areas.map(areaName);
    return annotated([`${sel.areas.length} ranges selected`, ...names], []);
  }
  if (area && !isSingleCell(area)) {
    const parts = cell.display ? [cell.display, 'Selected range', areaName(area)] : ['Selected range', areaName(area)];
    return annotated(parts, cell.annotations);
  }
  const parts = cell.display ? [cell.display, cellName(sel.active)] : [cellName(sel.active)];
  return annotated(parts, cell.annotations);
};
