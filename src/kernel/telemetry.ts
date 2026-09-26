import { randomUUID } from 'node:crypto';
import pino, { type Logger } from 'pino';

/**
 * Records one event with its fields, such as a driver action and how long it took. Code that
 * does work worth studying afterwards takes a Trace rather than a logger, so it stays testable.
 */
export type Trace = (event: string, fields?: Readonly<Record<string, unknown>>) => void;

/** A Trace that records nothing, for tests and for code run outside a command. */
export const NO_TRACE: Trace = () => undefined;

/**
 * Structured telemetry, one JSON object per line.
 *
 * Every line carries the run and invocation IDs, so one build's events can be pulled out
 * with jq. A build writes its own log in its run's folder.
 */
export interface Telemetry {
  readonly logger: Logger;
  /** Records events from inside a command, such as each driver action. */
  readonly trace: Trace;
  /** The file this invocation's lines are appended to. */
  readonly file: string;
}

/** Where telemetry goes, and the build it belongs to, if any. */
export interface TelemetryTarget {
  readonly logFile: string;
  readonly runId?: string | null;
}

export const openTelemetry = ({ logFile, runId = null }: TelemetryTarget): Telemetry => {
  const logger = pino(
    {
      base: { run: runId, invocation: randomUUID() },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination({ dest: logFile, mkdir: true, sync: true }),
  );
  return { logger, trace: (event, fields = {}) => logger.info(fields, event), file: logFile };
};
