import * as z from 'zod';

/** A1 notation for one cell: column letters, then a row number from 1. */
const CELL = '[A-Z]{1,3}[1-9]\\d{0,6}';
export const CELL_ADDRESS_PATTERN = new RegExp(`^${CELL}$`);
/** One cell, or a rectangle given by two opposite corners, such as B2:C4. */
export const RANGE_ADDRESS_PATTERN = new RegExp(`^${CELL}(?::${CELL})?$`);

export const cellAddressSchema = z
  .string()
  .regex(CELL_ADDRESS_PATTERN, { error: 'is not a single cell in A1 notation, such as B7' })
  .meta({ description: 'One cell, in A1 notation with capital letters, such as B7.' });

export type CellAddress = z.output<typeof cellAddressSchema>;

export const rangeAddressSchema = z
  .string()
  .regex(RANGE_ADDRESS_PATTERN, { error: 'is not a cell or range in A1 notation, such as B2:C4' })
  .meta({ description: 'One cell such as B7, or a rectangle of cells such as B2:C4.' });

export type RangeAddress = z.output<typeof rangeAddressSchema>;

export const cellAddressListSchema = z
  .array(cellAddressSchema)
  .min(1)
  .meta({ description: 'One or more cells, each in A1 notation.' });

/** Labels that cut across areas. Each one is documented where it's declared. */
export const CASE_TAGS = {
  /** The end-to-end walkthrough that must pass identically on Excel and on the clone. */
  golden: 'golden',
} as const;

const typedText = z.string().min(1).meta({
  description:
    'Exactly what a person types, before the sheet interprets it. It may be stored as a number, date, formula or text.',
});

/** Every step, by the name a case uses for it in `do`. Each description says what a person does. */
export const STEP_SCHEMAS = {
  select: z
    .strictObject({ do: z.literal('select'), range: rangeAddressSchema })
    .meta({ description: 'Select a cell or range by typing its address into the Name Box.' }),
  enter: z.strictObject({ do: z.literal('enter'), cell: cellAddressSchema, text: typedText }).meta({
    description: 'Select the cell, type the text, and press Enter. Typing replaces what was there.',
  }),
  'enter-in-selection': z
    .strictObject({ do: z.literal('enter-in-selection'), text: typedText })
    .meta({
      description:
        'Type the text and press Ctrl+Enter, which puts it in every selected cell as one change.',
    }),
  clear: z
    .strictObject({ do: z.literal('clear') })
    .meta({ description: 'Press Delete, which clears the content of every selected cell.' }),
  'fill-down': z.strictObject({ do: z.literal('fill-down') }).meta({
    description:
      'Press Ctrl+D (Cmd+D on a Mac): copy the top row of the selection into the rows below it.',
  }),
  copy: z
    .strictObject({ do: z.literal('copy') })
    .meta({ description: 'Press Ctrl+C (Cmd+C on a Mac) to copy the selection.' }),
  paste: z.strictObject({ do: z.literal('paste') }).meta({
    description: 'Press Ctrl+V (Cmd+V on a Mac) to paste what was copied at the selection.',
  }),
  undo: z
    .strictObject({ do: z.literal('undo') })
    .meta({ description: 'Press Ctrl+Z (Cmd+Z on a Mac) to undo the last change.' }),
  redo: z
    .strictObject({ do: z.literal('redo') })
    .meta({ description: 'Press Ctrl+Y (Cmd+Y on a Mac) to redo the last undone change.' }),
  observe: z
    .strictObject({
      do: z.literal('observe'),
      cells: cellAddressListSchema.meta({ description: 'The cells to record, in order.' }),
    })
    .meta({
      description:
        'A checkpoint: record what the sheet shows for these cells. Each becomes a checkpoint in reference.json.',
    }),
} as const;

export type StepName = keyof typeof STEP_SCHEMAS;

export const stepSchema = z
  .discriminatedUnion('do', [
    STEP_SCHEMAS.select,
    STEP_SCHEMAS.enter,
    STEP_SCHEMAS['enter-in-selection'],
    STEP_SCHEMAS.clear,
    STEP_SCHEMAS['fill-down'],
    STEP_SCHEMAS.copy,
    STEP_SCHEMAS.paste,
    STEP_SCHEMAS.undo,
    STEP_SCHEMAS.redo,
    STEP_SCHEMAS.observe,
  ])
  .meta({
    description:
      'One thing a person does, or a checkpoint where the sheet is observed. `do` says which.',
  });

export type Step = z.output<typeof stepSchema>;

/** Every step except observe: the things a person does to the sheet. */
export type ActionStep = Exclude<Step, { do: 'observe' }>;

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
