import { ok, type Result } from './result.ts';

/**
 * Runs `each` on the items one at a time, in order, for work that must not overlap, such as
 * driving one browser. Stops at the first failure and returns it; otherwise returns every result,
 * in the items' order.
 */
export const inOrder = <T, R>(
  items: readonly T[],
  each: (item: T, index: number) => Promise<Result<R>>,
): Promise<Result<R[]>> =>
  items.reduce<Promise<Result<R[]>>>(
    async (previous, item, index) => {
      const done = await previous;
      if (!done.success) return done;
      const next = await each(item, index);
      return next.success ? ok([...done.data, next.data]) : next;
    },
    Promise.resolve(ok([])),
  );

/** Does `each` to the items one at a time, in order, for effects that can't fail as Results. */
export const eachInOrder = <T>(
  items: readonly T[],
  each: (item: T, index: number) => Promise<unknown>,
): Promise<void> =>
  items.reduce<Promise<void>>(async (previous, item, index) => {
    await previous;
    await each(item, index);
  }, Promise.resolve());
