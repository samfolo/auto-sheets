/**
 * The HTTP API over one workbook session: every action a person can take, each returning the
 * session's fresh state so the screen never has to calculate anything.
 */
import { columnIndex, rowIndex } from '../engine/address.js';
import type { Endpoint } from '../engine/gestures.js';
import type { MoveKey, Session, SessionState } from '../engine/session.js';

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

const asObject = (body: unknown): Record<string, unknown> => {
  if (typeof body !== 'object' || body === null) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) out[key] = value;
  return out;
};

const asHold = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const MOVE_KEYS: Record<string, MoveKey> = {
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Tab: 'Tab',
  Enter: 'Enter',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
};

/** Parse a cell address such as B7 into zero-based coordinates. */
const cellOf = (address: unknown): { col: number; row: number } => {
  const text = asText(address);
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/i.exec(text);
  if (!match) throw new Error(`not a cell: ${text}`);
  return { col: columnIndex(match[1]!), row: rowIndex(Number(match[2])) };
};

/** Parse a drag endpoint: a cell, a column's letters or a row's number. */
const endpointOf = (value: unknown): Endpoint => {
  if (typeof value === 'number') return { kind: 'row', row: rowIndex(value) };
  const text = asText(value);
  if (/^[A-Z]{1,3}$/i.test(text)) return { kind: 'column', col: columnIndex(text) };
  if (/^\d+$/.test(text)) return { kind: 'row', row: rowIndex(Number(text)) };
  const cell = cellOf(text);
  return { kind: 'cell', col: cell.col, row: cell.row };
};

/** One action's effect on the session, keyed by the action's type. */
type Action = (session: Session, body: Record<string, unknown>) => void;

const ACTIONS: Record<string, Action> = {
  select: (session, body) => session.selectRange(asText(body.address)),
  commit: (session, body) =>
    session.commit(
      asText(body.text),
      body.ctrl === true,
      body.move === 'right' || body.move === 'none' ? body.move : 'down',
    ),
  clear: (session) => session.clear(),
  'fill-down': (session) => session.fillDown(),
  copy: (session) => session.copy(),
  paste: (session) => session.paste(),
  undo: (session) => session.undo(),
  redo: (session) => session.redo(),
  click: (session, body) => {
    const cell = cellOf(body.cell);
    session.click(cell.col, cell.row, asHold(body.hold));
  },
  'click-column': (session, body) =>
    session.clickColumn(columnIndex(asText(body.column)), asHold(body.hold)),
  'click-row': (session, body) => session.clickRow(rowIndex(Number(body.row)), asHold(body.hold)),
  'click-corner': (session) => session.clickCorner(),
  'select-all': (session) => session.selectAll(),
  drag: (session, body) =>
    session.drag(endpointOf(body.from), endpointOf(body.to), asHold(body.hold)),
  press: (session, body) =>
    session.press(MOVE_KEYS[asText(body.key)] ?? 'ArrowDown', asHold(body.hold)),
};

/** Run one action against the session and return the state it produced. */
export const runAction = (
  session: Session,
  type: string,
  body: Record<string, unknown>,
): SessionState => {
  const action = ACTIONS[type];
  if (!action) throw new Error(`unknown action: ${type}`);
  action(session, body);
  return session.state();
};

/** Handle one API request; returns null when the path is not ours. */
export const handleApi = async (
  session: Session,
  method: string,
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown } | null> => {
  if (!path.startsWith('/api/')) return null;
  if (path === '/api/health') return { status: 200, json: { ok: true } };
  if (path === '/api/state' && method === 'GET') return { status: 200, json: session.state() };
  if (path === '/api/reset' && method === 'POST') {
    session.reset();
    return { status: 200, json: session.state() };
  }
  if (path === '/api/action' && method === 'POST') {
    const payload = asObject(body);
    const type = asText(payload.type);
    return { status: 200, json: runAction(session, type, payload) };
  }
  return { status: 404, json: { error: 'not found' } };
};
