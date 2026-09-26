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
