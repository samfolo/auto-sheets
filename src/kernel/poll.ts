import { setTimeout as sleep } from 'node:timers/promises';

/** How long to keep checking, and how often. */
export interface PollTiming {
  readonly timeoutMs: number;
  readonly intervalMs: number;
}

/** The last value read, and whether it was accepted before time ran out. */
export interface Polled<T> {
  readonly accepted: boolean;
  readonly last: T;
}

/**
 * Reads a value until `accept` approves it or time runs out, and returns the last value read,
 * so a caller that gives up can say what it saw instead.
 */
export const poll = async <T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  { timeoutMs, intervalMs }: PollTiming,
): Promise<Polled<T>> => {
  const deadline = performance.now() + timeoutMs;
  const attempt = async (): Promise<Polled<T>> => {
    const last = await read();
    if (accept(last)) return { accepted: true, last };
    if (performance.now() >= deadline) return { accepted: false, last };
    await sleep(intervalMs);
    return attempt();
  };
  return attempt();
};
