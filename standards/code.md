# Standards

These are the factory's standards for any replica, whichever agent builds it. The scaffold every workspace starts with configures the type checker, linter and formatter to enforce what tooling can; this document is the judgement they can't enforce, and it will be reviewed.

## Stack

- TypeScript, strict, everywhere.
- React with Vite for the client, and a small Node HTTP server for the API.
- Well-tested libraries are welcome when they make the code simpler, such as a component the spec recommends. Say why you chose each in `NOTES.md`.

## Structure

- Keep the layers apart. `src/engine/` holds the product's rules and state, with no UI or HTTP. `src/server/` is the HTTP API over the engine. `src/client/` holds React components, hooks and styles.
- Give each module one responsibility. Resist putting everything in one file; the linter limits file length.
- Keep components small and compose them. Put styles in reusable modules named after what they style, with shared values in a theme.
- Start every module with a comment saying what it is for. Give every exported function a doc comment.
- Name constants instead of repeating literal values.
- Build it so it can be revisited and extended: someone adding a new rule or a new interaction should know exactly where it goes.

## Behaviour and interaction

- Behaviour is what a person sees after each action, not what the code holds.
- Implement the interactions a person uses with the original, with the mouse and the keyboard, not only the ones the checker drives. Implement the unhappy paths too: invalid input, errors and cancelled actions.
- Match the original's look where it carries meaning. Compare with the screenshots in `knowledge/`.

## Verification

- Test the engine's rules with Vitest, using tables of cases where cases differ only by data.
- Verify each layer on its own: the engine without the server, the server without the screen.
- `npm run check` must pass before every commit. Don't disable a lint rule to get past it.
