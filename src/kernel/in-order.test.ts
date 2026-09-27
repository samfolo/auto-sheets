import { describe, expect, it } from 'vitest';
import { eachInOrder, inOrder } from './in-order.ts';
import { fail, ok } from './result.ts';

describe('inOrder', () => {
  it('runs one at a time, in order, and returns every result', async () => {
    const started: number[] = [];
    const result = await inOrder([3, 1, 2], async (item) => {
      started.push(item);
      await new Promise((resolve) => setTimeout(resolve, item));
      return ok(item * 10);
    });
    expect(started).toEqual([3, 1, 2]);
    expect(result).toEqual(ok([30, 10, 20]));
  });

  it('stops at the first failure and returns it', async () => {
    const started: number[] = [];
    const result = await inOrder([1, 2, 3], async (item) => {
      started.push(item);
      return item === 2 ? fail('INTERNAL', 'two failed') : ok(item);
    });
    expect(started).toEqual([1, 2]);
    expect(result).toFailWith('INTERNAL');
  });
});

describe('eachInOrder', () => {
  it('finishes each before starting the next', async () => {
    const events: string[] = [];
    await eachInOrder(['a', 'b'], async (item) => {
      events.push(`start ${item}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`end ${item}`);
    });
    expect(events).toEqual(['start a', 'end a', 'start b', 'end b']);
  });
});
