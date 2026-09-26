import * as z from 'zod';
import { factoryErrorSchema } from './errors.ts';

/** What every command prints with --json: its Result. Agents parse this, so it's a contract. */
export const commandOutputSchema = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), data: z.unknown() }),
  z.object({ success: z.literal(false), error: factoryErrorSchema }),
]);

export type CommandOutput = z.output<typeof commandOutputSchema>;
