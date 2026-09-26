/**
 * The values a cell can hold and the display rules Excel's General format follows.
 */

/** Every error value the sheet can produce. */
export type CellError =
  '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?' | '#N/A' | '#NUM!' | '#NULL!' | '#SPILL!';

/** How a numeric cell draws itself. */
export type NumberFormat = 'general' | 'scientific' | 'percent' | 'date';

/** A scalar result of a formula or a stored cell value. */
export type Scalar = number | string | boolean;

/** The characters that make up every error value, for quick checks. */
const ERROR_VALUES = [
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#N/A',
  '#NUM!',
  '#NULL!',
  '#SPILL!',
] as const;

/** The error value a piece of text names, or null when it names no error. */
export const errorLiteral = (text: string): CellError | null =>
  ERROR_VALUES.find((value) => value === text) ?? null;

/** True when a scalar is an error value. */
export const isError = (value: Scalar): value is CellError =>
  typeof value === 'string' && errorLiteral(value) !== null;

/** Excel writes logical values in upper case. */
export const formatBoolean = (value: boolean): string => (value ? 'TRUE' : 'FALSE');

/** Round a number to the ~11 significant digits General shows, as Excel stores it. */
const generalNumber = (value: number): string => {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e11) return formatScientific(value, 2);
  const rounded = Number(value.toPrecision(11));
  if (Number.isInteger(rounded) && Math.abs(rounded) < 1e15) return String(rounded);
  return String(rounded);
};

/** A number in Excel's scientific notation, such as 1.00E+03. */
export const formatScientific = (value: number, digits = 2): string => {
  if (value === 0) return '0.00E+00';
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / 10 ** exponent;
  const rounded = mantissa.toFixed(digits);
  const sign = exponent < 0 ? '-' : '+';
  const pad = Math.abs(exponent).toString().padStart(2, '0');
  return `${rounded}E${sign}${pad}`;
};

/** A serial date number as Excel's General cell shows it, such as 2-Jan. */
export const formatDate = (serial: number): string => {
  const { year, month, day } = serialToDate(serial);
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const label = monthNames[month - 1] ?? '';
  return year === new Date().getFullYear() ? `${day}-${label}` : `${day}-${label}-${year}`;
};

/** Turn a serial day number into a calendar date (1900 date system). */
export const serialToDate = (serial: number): { year: number; month: number; day: number } => {
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(serial) * 86400000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};

/** Turn a calendar date into a serial day number (1900 date system). */
export const dateToSerial = (year: number, month: number, day: number): number =>
  Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000);

/** How a number inside a cell is drawn, following the cell's format. */
export const formatNumber = (value: number, format: NumberFormat): string => {
  if (format === 'scientific') return formatScientific(value, 2);
  if (format === 'percent') return `${generalNumber(value * 100)}%`;
  if (format === 'date') return formatDate(value);
  return generalNumber(value);
};
