// Talks to the workbook API: every content change goes through here.

import type { CellView } from '../engine/workbook.ts';

export interface StateBody {
  version: number;
  revision: number;
  cells: CellView[];
}

const request = async (path: string, body?: unknown): Promise<StateBody> => {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as StateBody;
};

/** The full server state. */
export const fetchState = (): Promise<StateBody> => request('/api/state');

/** POST a change to the workbook and get the new state back. */
export const postChange = (path: string, body?: unknown): Promise<StateBody> =>
  request(path, body ?? {});
