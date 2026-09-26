/**
 * The contract for an agent's settings, `agents/<name>/agent.json`. Its prompts sit beside it as
 * Markdown, so a person can read and change them without touching code.
 */
import * as z from 'zod';

/** Pi's thinking levels. A model that lacks a level uses the nearest one it has. */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

/**
 * Every tool an agent can be given: Pi's built-in tools, less `find`, which needs `fd` installed,
 * and the factory's harness tools. `bash` is the factory's own, without the factory's secrets.
 */
export const AGENT_TOOLS = [
  'read',
  'bash',
  'edit',
  'write',
  'grep',
  'ls',
  'check_cases',
  'try_steps',
] as const;

export type AgentToolName = (typeof AGENT_TOOLS)[number];

export const agentSettingsSchema = z
  .strictObject({
    description: z
      .string()
      .min(1)
      .meta({ description: 'What this agent is for, in one sentence.' }),
    model: z
      .strictObject({
        provider: z
          .string()
          .min(1)
          .meta({ description: 'The model provider, such as openrouter.' }),
        id: z.string().min(1).meta({ description: 'The model, as the provider names it.' }),
        thinking: z
          .enum(THINKING_LEVELS)
          .meta({ description: 'How much the model reasons before it acts.' }),
      })
      .meta({ description: 'Which model the agent runs on.' }),
    tools: z
      .array(z.enum(AGENT_TOOLS))
      .min(1)
      .meta({ description: 'The tools the agent may use. See AGENT_TOOLS.' }),
    context: z
      .array(
        z.string().regex(/^(?!\/)(?!.*\.\.)[\w./-]+\.md$/, {
          error: 'must be a Markdown file inside the factory, relative to its root',
        }),
      )
      .meta({
        description:
          'Factory documents that apply to any job the agent does, such as the standards, relative to the factory’s root. They are given to the agent as context, not copied where it can edit them. What a particular job is about belongs in its workspace instead.',
      }),
    budgetMinutes: z
      .number()
      .int()
      .min(1)
      .max(240)
      .meta({ description: 'How long the agent may work before it is stopped.' }),
  })
  .meta({ description: 'An agent’s settings: its model, its tools and its time budget.' });

export type AgentSettings = z.output<typeof agentSettingsSchema>;

export const agentRunSchema = z
  .strictObject({
    outcome: z.enum(['finished', 'timedOut', 'failed']).meta({
      description:
        'Why the agent stopped: it said it was done, it ran out of time, or a model call failed.',
    }),
    error: z
      .string()
      .nullable()
      .meta({ description: 'What went wrong when the outcome is failed; otherwise null.' }),
    toolCalls: z.number().int().min(0).meta({ description: 'How many tools the agent called.' }),
    replies: z.number().int().min(0).meta({ description: 'How many replies the model gave.' }),
    tokens: z.number().int().min(0).meta({ description: 'Tokens in and out, in total.' }),
    costUsd: z
      .number()
      .min(0)
      .meta({ description: 'Pi’s estimate from the provider’s prices, not a bill.' }),
  })
  .meta({ description: 'How a run of an agent went.' });

export type AgentRun = z.output<typeof agentRunSchema>;
