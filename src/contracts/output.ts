import * as z from 'zod';
import { factoryErrorSchema } from './errors.ts';

export const commandOutputSchema = z
  .discriminatedUnion('success', [
    z.object({
      success: z.literal(true).meta({ description: 'The command did what it was asked.' }),
      data: z
        .unknown()
        .meta({ description: 'What the command produced. Its shape is per command.' }),
    }),
    z.object({
      success: z.literal(false).meta({ description: 'The command failed.' }),
      error: factoryErrorSchema,
    }),
  ])
  .meta({
    description:
      'What every command prints with --json: its Result. Agents parse this, so it’s a contract.',
  });

export type CommandOutput = z.output<typeof commandOutputSchema>;
