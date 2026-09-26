import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pino, { type Logger } from 'pino';
import { artifactsDir } from './paths.ts';

/**
 * Structured telemetry, one JSON object per line.
 *
 * Every line carries the run and invocation IDs, so one build's events can be pulled out
 * with jq. A build sets FACTORY_RUN_ID and FACTORY_LOG so that every command it runs
 * writes to the build's own log. Otherwise, lines go to artifacts/factory.jsonl.
 */
export interface Telemetry {
  readonly logger: Logger;
  /** The file this invocation's lines are appended to. */
  readonly file: string;
}

export function openTelemetry(): Telemetry {
  const file = process.env.FACTORY_LOG ?? join(artifactsDir, 'factory.jsonl');
  const logger = pino(
    {
      base: { run: process.env.FACTORY_RUN_ID ?? null, invocation: randomUUID() },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination({ dest: file, mkdir: true, sync: true }),
  );
  return { logger, file };
}
