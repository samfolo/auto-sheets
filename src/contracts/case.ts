import * as z from 'zod';

/** A1 notation for one cell: column letters, then a row number from 1. */
export const CELL_ADDRESS_PATTERN = /^[A-Z]{1,3}[1-9]\d{0,6}$/;

export const cellAddressSchema = z
  .string()
  .regex(CELL_ADDRESS_PATTERN, { error: 'is not a single cell in A1 notation, such as B7' })
  .meta({ description: 'One cell, in A1 notation with capital letters, such as B7.' });

export type CellAddress = z.output<typeof cellAddressSchema>;

export const cellAddressListSchema = z
  .array(cellAddressSchema)
  .min(1)
  .meta({ description: 'One or more cells, each in A1 notation.' });

/** Labels that cut across areas. Each one is documented where it's declared. */
export const CASE_TAGS = {
  /** The end-to-end walkthrough that must pass identically on Excel and on the clone. */
  golden: 'golden',
} as const;

const enterStepSchema = z
  .strictObject({
    do: z.literal('enter'),
    cell: cellAddressSchema,
    text: z.string().meta({
      description:
        'Exactly what a person types, before Excel interprets it. Excel may store it as a number, date, formula or text.',
    }),
  })
  .meta({ description: 'Select the cell, type the text into the formula bar, and press Enter.' });

const observeStepSchema = z
  .strictObject({
    do: z.literal('observe'),
    cells: cellAddressListSchema.meta({ description: 'The cells to record, in order.' }),
  })
  .meta({
    description:
      'A checkpoint: record what the sheet shows for these cells. Each one becomes a checkpoint in reference.json.',
  });

const undoStepSchema = z
  .strictObject({ do: z.literal('undo') })
  .meta({ description: 'Press Ctrl+Z (Cmd+Z on a Mac) with the grid focused.' });

const redoStepSchema = z
  .strictObject({ do: z.literal('redo') })
  .meta({ description: 'Press Ctrl+Y (Cmd+Y on a Mac) with the grid focused.' });

export const stepSchema = z
  .discriminatedUnion('do', [enterStepSchema, observeStepSchema, undoStepSchema, redoStepSchema])
  .meta({
    description:
      'One thing a person does, or a checkpoint where the sheet is observed. `do` says which.',
  });

export type Step = z.output<typeof stepSchema>;

export const caseSchema = z
  .strictObject({
    description: z
      .string()
      .min(1)
      .meta({ description: 'The behaviour this case pins down, as one sentence.' }),
    tags: z
      .array(z.enum(Object.values(CASE_TAGS)))
      .default([])
      .meta({ description: 'Labels that cut across areas, such as "golden". See CASE_TAGS.' }),
    steps: z
      .array(stepSchema)
      .min(1)
      .refine((steps) => steps.some((step) => step.do === 'observe'), {
        error: 'needs at least one observe step, or nothing is recorded',
      })
      .meta({ description: 'What to do, in order, starting from a blank sheet.' }),
  })
  .meta({
    description:
      'A scenario to run on a blank sheet. Its id is its folder path under cases/, such as functions/sum/ignores-text.',
  });

export type Case = z.output<typeof caseSchema>;
