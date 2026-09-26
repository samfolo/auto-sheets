import * as z from 'zod';

/**
 * The events Pi prints with `--mode json`, one per line. Only the fields the factory reads are
 * described; everything else is kept as it came, in the run's agent.jsonl.
 */
export const agentEventSchema = z
  .looseObject({
    type: z
      .string()
      .meta({ description: 'What happened, such as tool_execution_start or message_end.' }),
    toolName: z
      .string()
      .optional()
      .meta({ description: 'For tool events: which tool the agent called, such as bash.' }),
    message: z
      .looseObject({
        role: z.string().meta({ description: 'Who wrote the message: user, assistant or tool.' }),
        usage: z
          .looseObject({
            totalTokens: z
              .number()
              .optional()
              .meta({ description: 'Tokens in and out for this reply.' }),
            cost: z
              .looseObject({
                total: z.number().meta({ description: 'Estimated cost in US dollars.' }),
              })
              .optional(),
          })
          .optional()
          .meta({ description: 'What one model reply used, as Pi estimates it.' }),
      })
      .optional()
      .meta({ description: 'For message events: the message itself.' }),
  })
  .meta({ description: 'One line of Pi’s JSON output.' });

export type AgentEvent = z.output<typeof agentEventSchema>;
