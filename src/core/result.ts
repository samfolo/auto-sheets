import type { ErrorCode, FactoryError } from '../contracts/errors.ts';

/**
 * The outcome of anything that can fail in an expected way.
 *
 * Functions return a Result instead of throwing, so every failure path shows up in the
 * type. The shape is the same as Zod's safeParse result, so validation results pass
 * straight through. Throwing is reserved for bugs.
 */
export type Result<T, E = FactoryError> =
  { readonly success: true; readonly data: T } | { readonly success: false; readonly error: E };

export const ok = <T>(data: T): Result<T, never> => ({ success: true, data });

export const fail = (
  code: ErrorCode,
  message: string,
  context: Omit<FactoryError, 'code' | 'message'> = {},
): Result<never> => ({ success: false, error: { code, message, ...context } });
