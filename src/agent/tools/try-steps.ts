/**
 * `try_steps`: lets the agent drive its own app exactly as the checker does, with steps of its
 * choosing, instead of improvising browser scripts. It answers with what each observe step saw
 * and the controls on the screen at the end.
 */
import { Type } from '@earendil-works/pi-ai';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import * as z from 'zod';
import { formatControl, type Control } from '../../browser/index.ts';
import { trySteps } from '../../clone/index.ts';
import { type Trace, validate } from '../../kernel/index.ts';
import { stepSchema } from '../../sheet/index.ts';
import { toolText } from './text.ts';

export const TRY_STEPS = {
  name: 'try_steps',
  label: 'Try steps',
  description: [
    'Drives your app exactly as check_cases does, with steps you choose, to see what the checker sees.',
    'It starts a fresh copy of your app with `npm start`, runs the steps on a blank sheet, then stops it.',
    'It reports what each observe step saw (raw content, displayed text and readout annotations),',
    'the controls on the screen at the end, and a picture of the screen, to compare with the original’s screenshots.',
  ].join(' '),
  /** The app's output from every try, in the run's folder. */
  logFile: 'try-app.log',
} as const;

/** Parts of a grid, which a DOM grid has hundreds of: counted, not listed. */
const GRID_PARTS: ReadonlySet<string> = new Set(['gridcell', 'columnheader', 'rowheader']);

/** The controls outside the grid, then how many grid parts there were. */
const describeControls = (controls: readonly Control[]): string[] => {
  const gridParts = controls.filter(({ role }) => GRID_PARTS.has(role)).length;
  return [
    ...controls.filter(({ role }) => !GRID_PARTS.has(role)).map(formatControl),
    ...(gridParts > 0 ? [`(and ${gridParts} grid cells and headers)`] : []),
  ];
};

const parameters = Type.Object({
  steps: Type.Array(Type.Unknown(), {
    description:
      'Steps in the same format as the steps in a case.json, such as {"do":"enter","cell":"A1","text":"=1+2"} and {"do":"observe","cells":["A1"]}. cases/case.schema.json describes every step.',
  }),
});

export const createTryStepsTool = (workspace: string, runDir: string, trace: Trace) =>
  defineTool({
    name: TRY_STEPS.name,
    label: TRY_STEPS.label,
    description: TRY_STEPS.description,
    parameters,
    // It starts a copy of the app, so it never runs alongside the agent's other tools.
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const steps = validate(z.array(stepSchema).min(1), params.steps, 'steps');
      if (!steps.success) {
        return toolText([steps.error.message, ...(steps.error.details ?? [])].join('\n'));
      }
      const tried = await trySteps(workspace, steps.data, join(runDir, TRY_STEPS.logFile), trace);
      if (!tried.success) {
        return toolText([tried.error.message, ...(tried.error.details ?? [])].join('\n'));
      }
      const report = toolText(
        [
          'Observed:',
          JSON.stringify(tried.data.checkpoints, null, 2),
          '',
          'Controls on the screen at the end:',
          ...describeControls(tried.data.controls),
        ].join('\n'),
      );
      const { screenshot } = tried.data;
      return screenshot === null
        ? report
        : {
            ...report,
            content: [
              ...report.content,
              {
                type: 'image' as const,
                data: screenshot.toString('base64'),
                mimeType: 'image/png',
              },
            ],
          };
    },
  });
