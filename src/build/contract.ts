import * as z from 'zod';
import { agentRunSchema, THINKING_LEVELS } from '../agent/index.ts';
import { verdictSchema } from '../cases/index.ts';
import { cloneScoreSchema } from '../clone/index.ts';
import { factoryStampSchema, logLineSchema } from '../kernel/index.ts';

export const buildOptionsSchema = z
  .strictObject({
    agent: z.string().min(1).meta({
      description: 'The agent to build with: a folder under agents/, such as builder.',
    }),
    out: z.string().min(1).optional().meta({
      description:
        'A new directory, outside the factory, for the workspace. By default it is named after the run, beside the factory.',
    }),
    minutes: z.coerce.number().int().min(1).max(240).optional().meta({
      description: 'How long the agent may work, in whole minutes. By default, its own budget.',
    }),
  })
  .meta({ description: 'What `factory build` was asked to do.' });

export type BuildOptions = z.output<typeof buildOptionsSchema>;

export const finalCheckSchema = z
  .strictObject({
    score: cloneScoreSchema.nullable().meta({
      description: 'How the clone did on every recorded case, or null if the check couldn’t run.',
    }),
    verdicts: z.array(verdictSchema).meta({ description: 'How each case went.' }),
    problem: z.string().nullable().meta({
      description: 'Why the check couldn’t run, such as the clone not starting; otherwise null.',
    }),
  })
  .meta({ description: 'The factory’s own check of the finished clone, on every recorded case.' });

export type FinalCheck = z.output<typeof finalCheckSchema>;

export const buildSummarySchema = z
  .strictObject({
    runId: z.string().meta({ description: 'The run’s id: when it started.' }),
    factory: factoryStampSchema,
    agent: z
      .strictObject({
        name: z.string().meta({ description: 'The agent’s folder under agents/.' }),
        model: z.string().meta({ description: 'The model, as provider/id.' }),
        thinking: z.enum(THINKING_LEVELS).meta({ description: 'The thinking level it ran at.' }),
      })
      .meta({ description: 'Which agent built the clone.' }),
    workspace: z.string().meta({ description: 'Where the clone was built.' }),
    startedAt: z.iso.datetime().meta({ description: 'When the build started.' }),
    finishedAt: z.iso.datetime().meta({ description: 'When the final check finished.' }),
    run: agentRunSchema,
    check: finalCheckSchema,
  })
  .meta({
    description:
      'A build’s summary.json: what made the clone and how it did, so runs can be compared as the factory and its agents change.',
  });

export type BuildSummary = z.output<typeof buildSummarySchema>;

export const scoreEventSchema = logLineSchema
  .extend({
    msg: z.literal('agent.score'),
    passed: z.number().int().min(0).meta({ description: 'How many of the checked cases passed.' }),
    total: z.number().int().min(0).meta({ description: 'How many cases were checked.' }),
  })
  .meta({ description: 'A check_cases result in a run’s log: one point on its score curve.' });

export type ScoreEvent = z.output<typeof scoreEventSchema>;
