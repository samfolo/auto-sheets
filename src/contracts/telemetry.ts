import * as z from 'zod';

/**
 * One line of the factory's JSONL telemetry. Every line has these fields, and each event
 * adds its own. Anything that analyses a run can rely on them.
 */
export const logLineSchema = z.looseObject({
  /** pino's numeric level: 30 info, 40 warn, 50 error. */
  level: z.number(),
  /** When the line was written, as an ISO 8601 timestamp. */
  time: z.iso.datetime(),
  /** The build the line belongs to, or null outside a build. */
  run: z.string().nullable(),
  /** One CLI invocation. */
  invocation: z.uuid(),
  /** The event, such as command.start. */
  msg: z.string(),
});

export type LogLine = z.output<typeof logLineSchema>;
