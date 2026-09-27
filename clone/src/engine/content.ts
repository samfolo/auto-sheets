// What a cell holds, how typed text is interpreted, and how values are displayed.

export type NumberFormat = 'general' | 'scientific' | 'percent' | 'fraction';

export type CellContent =
  | { kind: 'empty' }
  | { kind: 'number'; value: number; format: NumberFormat }
  | { kind: 'text'; text: string; quoted: boolean }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'date'; serial: number; hasYear: boolean }
  | { kind: 'formula'; raw: string; broken: boolean };

export const EMPTY: CellContent = { kind: 'empty' };

export type ExcelError = '#DIV/0!' | '#VALUE!' | '#NAME?' | '#REF!' | '#N/A' | '#NUM!' | '#NULL!';

const MONTHS = [
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

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Days between the 1900 date system's epoch and a y/m/d date. */
export const dateSerial = (year: number, month: number, day: number): number =>
  Math.floor(Date.UTC(year, month - 1, day) / 86400000) + 25569;

/** The y/m/d behind a serial number. */
export const serialDate = (serial: number): { y: number; m: number; d: number } => {
  const date = new Date((serial - 25569) * 86400000);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
};

/** Scientific notation as Excel shows it: 1.00E+03, trailing zeros trimmed when general. */
export const scientificDisplay = (value: number, decimals: number, trim: boolean): string => {
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / 10 ** exp;
  let m = mantissa.toFixed(decimals);
  if (trim) m = String(Number(m));
  const sign = exp < 0 ? '-' : '+';
  return `${m}E${sign}${String(Math.abs(exp)).padStart(2, '0')}`;
};

/** How the General format shows a number in a cell. */
export const generalDisplay = (value: number): string => {
  if (!Number.isFinite(value)) return '#NUM!';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e11 || abs < 1e-9) return scientificDisplay(value, 5, true);
  const rounded = Number(value.toPrecision(11));
  const s = String(rounded);
  return s.includes('e') ? scientificDisplay(value, 5, true) : s;
};

/** The plain, normal form of a stored number for the formula bar. */
export const numberRaw = (value: number): string => {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  const p = Number(value.toPrecision(15));
  return String(p);
};

/** Display for a stored number, honouring the format it was typed with. */
export const numberDisplay = (value: number, format: NumberFormat): string => {
  if (format === 'scientific') return scientificDisplay(value, 2, false);
  if (format === 'percent') return `${generalDisplay(value * 100)}%`;
  return generalDisplay(value);
};

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

interface ParsedNumber {
  value: number;
  format: NumberFormat;
}

/** Read a numeric literal (optional brackets, percent, E notation). */
export const parseNumberLiteral = (text: string): ParsedNumber | null => {
  let t = text.trim();
  if (t === '') return null;
  let negative = false;
  const bracketed = /^\(.*\)$/.test(t);
  if (bracketed) t = t.slice(1, -1).trim();
  let format: NumberFormat = 'general';
  if (t.endsWith('%')) {
    format = 'percent';
    t = t.slice(0, -1).trim();
  }
  if (!NUMBER_RE.test(t)) return null;
  let value = Number(t);
  if (!Number.isFinite(value)) return null;
  if (/[eE]/.test(t)) format = 'scientific';
  if (bracketed) negative = true;
  if (negative) value = -value;
  if (format === 'percent') value = value / 100;
  return { value, format };
};

const DATE_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;

/** Read a typed date (month first, current year when omitted). */
export const parseDateLiteral = (text: string, now: Date): CellContent | null => {
  const m = DATE_RE.exec(text.trim());
  if (!m || !m[1] || !m[2]) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > (DAYS[month - 1] ?? 31)) return null;
  let year = now.getFullYear();
  const hasYear = m[3] !== undefined;
  if (m[3] !== undefined) {
    year = Number(m[3]);
    if (m[3].length <= 2) year += year < 30 ? 2000 : 1900;
  }
  return { kind: 'date', serial: dateSerial(year, month, day), hasYear };
};

const FRACTION_RE = /^[+-]?\d+\s+\d+\/\d+$/;

/** Interpret typed text the way Excel does. */
export const parseEntry = (text: string, now: Date = new Date()): CellContent => {
  if (text.startsWith('=')) return { kind: 'formula', raw: text, broken: false };
  if (text.startsWith("'")) return { kind: 'text', text: text.slice(1), quoted: true };
  const trimmed = text.trim();
  if (/^(true|false)$/i.test(trimmed)) return { kind: 'boolean', value: trimmed.toLowerCase() === 'true' };
  const num = parseNumberLiteral(text);
  if (num) return { kind: 'number', value: num.value, format: num.format };
  if (FRACTION_RE.test(trimmed)) {
    const [whole, frac] = trimmed.split(/\s+/);
    if (whole && frac) {
      const [n, d] = frac.split('/');
      const value = Number(whole) + (Number(whole) < 0 ? -1 : 1) * (Number(n) / Number(d));
      if (Number.isFinite(value)) return { kind: 'number', value, format: 'fraction' };
    }
  }
  const date = parseDateLiteral(text, now);
  if (date) return date;
  return { kind: 'text', text, quoted: false };
};

/** The formula bar's text for a stored entry. */
export const contentRaw = (content: CellContent): string => {
  switch (content.kind) {
    case 'empty':
      return '';
    case 'number':
      if (content.format === 'percent') return `${generalDisplay(content.value * 100)}%`;
      return numberRaw(content.value);
    case 'text':
      return content.quoted ? `'${content.text}` : content.text;
    case 'boolean':
      return content.value ? 'TRUE' : 'FALSE';
    case 'date': {
      const { y, m, d } = serialDate(content.serial);
      return `${m}/${d}/${y}`;
    }
    case 'formula':
      return content.raw;
  }
};

/** The displayed text of a literal (non-formula) entry. */
export const literalDisplay = (content: CellContent): string => {
  switch (content.kind) {
    case 'number':
      if (content.format === 'fraction') return generalDisplay(content.value);
      return numberDisplay(content.value, content.format);
    case 'text':
      return content.text;
    case 'boolean':
      return content.value ? 'TRUE' : 'FALSE';
    case 'date': {
      const { y, m, d } = serialDate(content.serial);
      const mon = MONTHS[m - 1] ?? '';
      return content.hasYear ? `${d}-${mon}-${y}` : `${d}-${mon}`;
    }
    default:
      return '';
  }
};
