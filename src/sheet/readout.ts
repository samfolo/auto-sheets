/**
 * Reads the screen-reader description of the selection. Excel's format was observed, not
 * documented, and a clone must produce the same one:
 *
 * - one cell: `<display> . <address> . <annotation> . `, e.g. `5 . A3 . Contains Formula . `,
 *   with the display left out for an empty cell, e.g. `C5 . `;
 * - a range: `<display of the active cell> . Selected range . <range> . <annotation> . `, e.g.
 *   `1 . Selected range . B1:B3 . `.
 */

const SEPARATOR = ' . ';
const RANGE_MARKER = 'Selected range';

/** What the readout says about a cell, apart from its address. */
export interface Readout {
  readonly display: string;
  readonly annotations: readonly string[];
}

/** Splits the label around the address. Returns null if the label is about another cell. */
const splitAround = (label: string, address: string): [string, string] | null => {
  const marker = `${address}${SEPARATOR}`;
  const after = label.indexOf(`${SEPARATOR}${marker}`);
  if (after >= 0) {
    return [label.slice(0, after), label.slice(after + SEPARATOR.length + marker.length)];
  }
  return label.startsWith(marker) ? ['', label.slice(marker.length)] : null;
};

/** Reads the readout of a single selected cell. Returns null if it describes something else. */
export const parseReadout = (label: string, address: string): Readout | null => {
  const parts = splitAround(label, address);
  if (parts === null) return null;
  const [display, rest] = parts;
  return {
    display,
    annotations: rest
      .split(SEPARATOR)
      .map((annotation) => annotation.trim())
      .filter((annotation) => annotation !== ''),
  };
};

/** Whether the readout describes `range` as the selection: a single cell, or a range. */
export const describesSelection = (label: string, range: string): boolean =>
  range.includes(':')
    ? label.includes(`${RANGE_MARKER}${SEPARATOR}${range}${SEPARATOR}`)
    : parseReadout(label, range) !== null;
