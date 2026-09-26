import * as z from 'zod';
/**
 * The contracts for cases: case.json, which says what a person does, and reference.json, which
 * records what Excel showed at each checkpoint.
 */
import { cellAddressSchema, cellObservationSchema, stepSchema } from '../sheet/index.ts';

export const checkpointSchema = z
  .strictObject({
    step: z.number().int().min(0).meta({
      description: 'The index, in case.json’s steps, of the observe step this checkpoint records.',
    }),
    cells: z
      .record(cellAddressSchema, cellObservationSchema)
      .meta({ description: 'Each observed cell, by address, in the order the step listed them.' }),
  })
  .meta({ description: 'What the sheet showed at one observe step.' });

export type Checkpoint = z.output<typeof checkpointSchema>;

export const referenceSchema = z
  .strictObject({
    recordedAt: z.iso.datetime().meta({ description: 'When Excel was observed.' }),
    environment: z.string().min(1).meta({
      description:
        'Which product and regional format produced the recording. Dates and numbers are read differently between regions.',
    }),
    checkpoints: z.array(checkpointSchema).meta({
      description:
        'What Excel showed at each observe step, in order: the ground truth the clone is compared against.',
    }),
  })
  .meta({
    description:
      'Excel’s recorded trajectory for one case. Written only by `factory case record`, from two runs that agreed; never edited by hand.',
  });

export type Reference = z.output<typeof referenceSchema>;

/** Labels that cut across areas. Each one is documented where it's declared. */
export const CASE_TAGS = {
  /** The end-to-end walkthrough that must pass identically on Excel and on the clone. */
  golden: 'golden',
  /**
   * Kept from the agent that builds a clone, so the final check can tell whether it learned the
   * rules or fitted the cases it saw. Held-out cases test rules the other cases also show.
   */
  heldOut: 'held-out',
} as const;

export const caseSchema = z
  .strictObject({
    description: z
      .string()
      .min(1)
      .meta({ description: 'The behaviour this case pins down, as one sentence.' }),
    tags: z
      .array(z.enum(Object.values(CASE_TAGS)))
      .default([])
      .meta({
        description: 'Labels that cut across areas, such as "golden" or "held-out". See CASE_TAGS.',
      }),
    steps: z
      .array(stepSchema)
      .min(1)
      .refine((steps) => steps.some((step) => step.do === 'observe'), {
        error: 'needs at least one observe step, or nothing is recorded',
      })
      .meta({
        description:
          'What to do, in order, starting from a blank sheet, or from seed.xlsx in the case’s folder if there is one.',
      }),
  })
  .meta({
    description:
      'A scenario to run on a sheet. Its id is its folder path under cases/, such as functions/sum/ignores-text.',
  });

export type Case = z.output<typeof caseSchema>;

export const verdictSchema = z
  .strictObject({
    id: z.string().meta({ description: 'The case’s id.' }),
    tags: z.array(z.string()).meta({
      description: 'The case’s tags, so verdicts can be counted by kind, such as held-out.',
    }),
    passed: z
      .boolean()
      .meta({ description: 'Whether the clone matched Excel at every checkpoint.' }),
    problems: z.array(z.string()).meta({
      description: 'Each difference from Excel, or the reason the case couldn’t run.',
    }),
  })
  .meta({ description: 'How one case went on a clone.' });

export type Verdict = z.output<typeof verdictSchema>;
