/**
 * Reads Excel's screen-reader description of the active cell. Its format was observed, not
 * documented: `<display> . <address> . <annotation> . `, with the display left out for an
 * empty cell. For example `5 . A3 . Contains Formula . ` or `C5 . `.
 */

const SEPARATOR = ' . ';

/** What the readout says about a cell, apart from its address. */
export interface Readout {
  readonly display: string;
  readonly annotations: readonly string[];
}

/** Splits the label around the address. Returns null if the label is about another cell. */
const splitAround = (label: string, address: string): [string, string] | null => {
  const marker = `${address}${SEPARATOR}`;
  const after = label.indexOf(`${SEPARATOR}${marker}`);
  if (after >= 0)
    return [label.slice(0, after), label.slice(after + SEPARATOR.length + marker.length)];
  return label.startsWith(marker) ? ['', label.slice(marker.length)] : null;
};

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
