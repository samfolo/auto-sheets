import { randomUUID } from 'node:crypto';
import pino, { type Logger } from 'pino';
import type { Runtime } from '../contracts/environment.ts';

/**
 * Structured telemetry, one JSON object per line.
 *
 * Every line carries the run and invocation IDs, so one build's events can be pulled out
 * with jq. A build points every command it runs at the build's own log (see Runtime).
 */
export interface Telemetry {
  readonly logger: Logger;
  /** The file this invocation's lines are appended to. */
  readonly file: string;
}

export const openTelemetry = ({ logFile, runId }: Runtime): Telemetry => ({
  logger: pino(
    {
      base: { run: runId, invocation: randomUUID() },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination({ dest: logFile, mkdir: true, sync: true }),
  ),
  file: logFile,
});
