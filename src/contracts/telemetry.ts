import * as z from 'zod';

export const logLineSchema = z
  .looseObject({
    level: z.number().meta({ description: 'pino’s numeric level: 30 info, 40 warn, 50 error.' }),
    time: z.iso.datetime().meta({ description: 'When the line was written.' }),
    run: z
      .string()
      .nullable()
      .meta({ description: 'The build the line belongs to, or null outside a build.' }),
    invocation: z
      .uuid()
      .meta({ description: 'One CLI invocation. Every line it writes shares it.' }),
    msg: z.string().meta({ description: 'The event, such as command.start.' }),
  })
  .meta({
    description:
      'One line of the factory’s JSONL telemetry. Every line has these fields; each event adds its own.',
  });

export type LogLine = z.output<typeof logLineSchema>;
