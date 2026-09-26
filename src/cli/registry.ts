import type { CommandUnknownOpts } from '@commander-js/extra-typings';
import type { Result, Trace } from '../kernel/index.ts';

/**
 * What a slice is given to add its commands to the CLI. Each slice owns its commands, in its own
 * commands.ts, and the CLI only assembles them, so slices never depend on the CLI at runtime.
 */
export interface CommandRegistry {
  /** The root program. A slice adds its commands, or a group of them, to it. */
  readonly program: CommandUnknownOpts;
  /**
   * Runs a command's action and reports its Result: it logs the start and end, turns a throw
   * into an INTERNAL error, prints text or JSON, and sets the exit code.
   */
  readonly run: <T>(
    command: string,
    action: (trace: Trace) => Promise<Result<T>>,
    render: (data: T) => string,
  ) => Promise<void>;
}

/** A slice's contribution to the CLI. */
export type RegisterCommands = (registry: CommandRegistry) => void;
