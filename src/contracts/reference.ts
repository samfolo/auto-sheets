import * as z from 'zod';
import { cellAddressSchema } from './case.ts';

export const cellObservationSchema = z
  .strictObject({
    raw: z.string().meta({
      description:
        'What the formula bar shows: the cell’s content after Excel interpreted what was typed. Empty for an empty cell.',
    }),
    display: z.string().meta({
      description:
        'What the cell shows, as Excel announces it to screen readers. Empty for an empty cell.',
    }),
    annotations: z.array(z.string()).meta({
      description:
        'Anything else Excel announces about the cell, such as "Contains Formula" or "Contains error".',
    }),
  })
  .meta({ description: 'What one cell looked like at a checkpoint.' });

export type CellObservation = z.output<typeof cellObservationSchema>;

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
