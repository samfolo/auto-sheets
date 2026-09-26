/**
 * Marks the end of an exhaustive `switch`. The type check proves it can't be reached; if it
 * ever is, the data broke its contract, which is a bug, so it throws.
 */
export const unreachable = (value: never): never => {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
};
