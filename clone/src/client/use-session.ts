/**
 * The screen's link to the API: it holds the last state the server returned and sends every
 * action there. It also notices a reset made from outside the screen, such as the checker's.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionState } from '../engine/session.js';

/** What a component needs from the session: the state and a way to run an action. */
export interface SessionApi {
  state: SessionState | null;
  call: (type: string, body?: Record<string, unknown>) => Promise<void>;
}

const ACTION_URL = '/api/action';
const STATE_URL = '/api/state';
const POLL_MS = 300;

const fetchState = async (): Promise<SessionState> => {
  const response = await fetch(STATE_URL);
  const state: SessionState = await response.json();
  return state;
};

/** Keep the server's state mirrored on the screen, polling only for outside resets. */
export const useSession = (): SessionApi => {
  const [state, setState] = useState<SessionState | null>(null);
  const version = useRef<number | null>(null);

  const call = useCallback(async (type: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(ACTION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, ...body }),
    });
    const next: SessionState = await response.json();
    version.current = next.version;
    setState(next);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      const next = await fetchState();
      if (!active) return;
      version.current = next.version;
      setState(next);
    };
    void load();
    const timer = setInterval(() => {
      void (async () => {
        const next = await fetchState();
        if (!active || next.version === version.current) return;
        version.current = next.version;
        setState(next);
      })();
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return { state, call };
};
