/** The contract for a clone's score, which a build's summary records. */
import * as z from 'zod';

export const tallySchema = z
  .strictObject({
    passed: z.number().int().min(0).meta({ description: 'How many of the cases passed.' }),
    total: z.number().int().min(0).meta({ description: 'How many cases there were.' }),
  })
  .meta({ description: 'How many of some cases passed.' });

export type Tally = z.output<typeof tallySchema>;

export const cloneScoreSchema = z
  .strictObject({
    seen: tallySchema.meta({ description: 'The cases the agent could see and check against.' }),
    heldOut: tallySchema.meta({
      description:
        'The cases kept from the agent: evidence it learned the rules rather than fitted the cases.',
    }),
    golden: tallySchema.meta({ description: 'The end-to-end walkthrough, which must pass.' }),
  })
  .meta({ description: 'How a clone did, counted by kind of case.' });

export type CloneScore = z.output<typeof cloneScoreSchema>;
