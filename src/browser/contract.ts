import * as z from 'zod';

export const browserSessionSchema = z
  .strictObject({
    pid: z.number().int().positive().meta({
      description: 'The host process that owns the browser. Stopping it closes the browser.',
    }),
    port: z.number().int().min(1).max(65_535).meta({
      description: 'The local port where the browser accepts Chrome DevTools Protocol connections.',
    }),
    headless: z.boolean().meta({ description: 'Whether the browser window is hidden.' }),
    startedAt: z.iso.datetime().meta({ description: 'When the session started.' }),
  })
  .meta({
    description:
      'The running browser session, written by `factory browser start` to artifacts/browser/session.json.',
  });

export type BrowserSession = z.output<typeof browserSessionSchema>;

export const boxSchema = z
  .strictObject({
    x: z.number().meta({ description: 'Left edge, in CSS pixels from the viewport’s left.' }),
    y: z.number().meta({ description: 'Top edge, in CSS pixels from the viewport’s top.' }),
    width: z.number().meta({ description: 'Width in CSS pixels.' }),
    height: z.number().meta({ description: 'Height in CSS pixels.' }),
  })
  .meta({ description: 'Where an element is drawn, as `getBoundingClientRect()` reports it.' });

export type Box = z.output<typeof boxSchema>;

/** Other fields, such as a heading's level, are dropped: exploring doesn't use them. */
export const ariaNodeSchema = z
  .object({
    role: z.string().meta({ description: 'The node’s accessibility role, such as textbox.' }),
    name: z.string().optional().meta({ description: 'Its accessible name, such as a label.' }),
    text: z.string().optional().meta({ description: 'The text it shows, such as a value.' }),
    ref: z.string().optional().meta({
      description:
        'Playwright’s reference to the element, usable as the selector `aria-ref=<ref>`.',
    }),
    box: boxSchema.optional(),
    get children() {
      return z.array(ariaNodeSchema).optional().meta({ description: 'The nodes inside it.' });
    },
  })
  .meta({
    description:
      'One node of the page’s accessibility tree, as Playwright’s `ariaSnapshotJSON` returns it.',
  });

export type AriaNode = z.output<typeof ariaNodeSchema>;
