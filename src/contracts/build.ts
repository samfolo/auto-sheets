import * as z from 'zod';

export const buildOptionsSchema = z
  .strictObject({
    out: z.string().min(1).meta({
      description:
        'A new directory, outside the factory, where the agent builds the clone from scratch.',
    }),
    minutes: z.coerce.number().int().min(1).max(240).meta({
      description: 'How long the agent may work before it is stopped, in whole minutes.',
    }),
  })
  .meta({ description: 'What `factory build` was asked to do.' });

export type BuildOptions = z.output<typeof buildOptionsSchema>;
