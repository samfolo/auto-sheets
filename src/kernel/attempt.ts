import { ok, type Result } from './result.ts';

/** The first line of whatever was thrown. For Node and Playwright errors, it says what failed. */
export const describeThrown = (thrown: unknown): string =>
  (thrown instanceof Error ? thrown.message : String(thrown)).split('\n')[0]?.trim() ?? '';

/**
 * Calls code that reports failure by throwing (Node's file system, Playwright) and returns a
 * Result instead. `onError` turns the thrown message into the failure the caller reports; it
 * may be asynchronous, for example to attach a screenshot.
 */
export const attempt = async <T>(
  action: () => Promise<T>,
  onError: (reason: string) => Result<never> | Promise<Result<never>>,
): Promise<Result<T>> => {
  try {
    return ok(await action());
  } catch (thrown) {
    return onError(describeThrown(thrown));
  }
};
