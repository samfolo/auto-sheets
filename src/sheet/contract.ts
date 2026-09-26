/**
 * The contracts for driving a sheet: cell and range addresses, the steps a person takes, and
 * what a cell looks like when observed. They're shared by every target and by cases.
 */
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

export const columnSchema = z
  .string()
  .regex(/^[A-Z]{1,3}$/, { error: 'is not a column, such as B' })
  .meta({ description: 'A column, by its letters, such as B.' });

export const rowSchema = z
  .number()
  .int()
  .min(1)
  .max(1_048_576)
  .meta({ description: 'A row, by its number, such as 3.' });

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
  click: z
    .strictObject({ do: z.literal('click'), cell: cellAddressSchema })
    .meta({ description: 'Click the cell with the mouse, which selects it.' }),
  'double-click': z
    .strictObject({ do: z.literal('double-click'), cell: cellAddressSchema })
    .meta({ description: 'Double-click the cell, which starts editing it in place.' }),
  drag: z
    .strictObject({ do: z.literal('drag'), from: cellAddressSchema, to: cellAddressSchema })
    .meta({
      description: 'Press the mouse on one cell, move it to another and release: a range.',
    }),
  'click-column': z
    .strictObject({ do: z.literal('click-column'), column: columnSchema })
    .meta({ description: 'Click the column’s header, above its first row.' }),
  'click-row': z
    .strictObject({ do: z.literal('click-row'), row: rowSchema })
    .meta({ description: 'Click the row’s header, left of its first column.' }),
  'drag-columns': z
    .strictObject({ do: z.literal('drag-columns'), from: columnSchema, to: columnSchema })
    .meta({ description: 'Press on one column’s header, drag to another’s and release.' }),
  'drag-rows': z
    .strictObject({ do: z.literal('drag-rows'), from: rowSchema, to: rowSchema })
    .meta({ description: 'Press on one row’s header, drag to another’s and release.' }),
  'click-corner': z.strictObject({ do: z.literal('click-corner') }).meta({
    description:
      'Click the corner above the row headers and left of the column headers, which selects everything.',
  }),
  type: z.strictObject({ do: z.literal('type'), text: typedText }).meta({
    description:
      'Type the text where the sheet has the focus, without selecting anything first, then press Enter.',
  }),
  'observe-selection': z.strictObject({ do: z.literal('observe-selection') }).meta({
    description:
      'A checkpoint: record the selection as the Name Box and the screen-reader readout describe it, without changing it.',
  }),
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
    STEP_SCHEMAS.click,
    STEP_SCHEMAS['double-click'],
    STEP_SCHEMAS.drag,
    STEP_SCHEMAS['click-column'],
    STEP_SCHEMAS['click-row'],
    STEP_SCHEMAS['drag-columns'],
    STEP_SCHEMAS['drag-rows'],
    STEP_SCHEMAS['click-corner'],
    STEP_SCHEMAS.type,
    STEP_SCHEMAS['observe-selection'],
    STEP_SCHEMAS.observe,
  ])
  .meta({
    description:
      'One thing a person does, or a checkpoint where the sheet is observed. `do` says which.',
  });

export type Step = z.output<typeof stepSchema>;

/** Every step except the checkpoints: the things a person does to the sheet. */
export type ActionStep = Exclude<Step, { do: 'observe' } | { do: 'observe-selection' }>;

/** A step that only makes sense with a mouse: the driver finds the grid's geometry first. */
export type PointerStep = Extract<
  ActionStep,
  {
    do:
      | 'click'
      | 'double-click'
      | 'drag'
      | 'click-column'
      | 'click-row'
      | 'drag-columns'
      | 'drag-rows'
      | 'click-corner';
  }
>;

export const selectionObservationSchema = z
  .strictObject({
    active: z.string().meta({
      description:
        'What the Name Box shows: the active cell, such as K1 when column K is selected.',
    }),
    range: z.string().nullable().meta({
      description:
        'The selected range as the readout names it, such as C3:E6, K:K, 5:5 or A:XFD; null when only one cell is selected.',
    }),
    editing: z.boolean().meta({ description: 'Whether the readout says a cell is being edited.' }),
  })
  .meta({ description: 'What the selection was at a checkpoint.' });

export type SelectionObservation = z.output<typeof selectionObservationSchema>;

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
