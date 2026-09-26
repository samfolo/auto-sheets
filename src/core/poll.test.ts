import { describe, expect, it } from 'vitest';
import { poll } from './poll.ts';

const counter = () => {
  const state = { reads: 0 };
  return { read: async () => ++state.reads, state };
};

describe('poll', () => {
  it('returns as soon as a value is accepted', async () => {
    const { read, state } = counter();
    expect(await poll(read, (n) => n === 3, { timeoutMs: 1_000, intervalMs: 1 })).toEqual({
      accepted: true,
      last: 3,
    });
    expect(state.reads).toBe(3);
  });

  it('gives up after the timeout and reports the last value it read', async () => {
    const result = await poll(
      async () => 'loading',
      (value) => value === 'ready',
      {
        timeoutMs: 20,
        intervalMs: 5,
      },
    );
    expect(result).toEqual({ accepted: false, last: 'loading' });
  });
});
