/** A tool's answer to the agent: one block of text, and nothing for Pi's interface to render. */
export const toolText = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  details: undefined,
});
