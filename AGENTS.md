# Working on the factory

This repository is the factory. Clones are built elsewhere. Landed decisions are in `docs/decisions.md`, and the reasoning behind them is in `docs/log.md`.

## Commands

- `npx factory --help` lists the CLI's commands. `npx factory doctor` checks prerequisites.
- `npm run check` type-checks and runs the tests. Run it before every commit.

## Conventions

- Node runs the TypeScript directly. Use erasable syntax only (no enums, namespaces or parameter properties), and end relative imports in `.ts`.
- Failures are values. Return a `Result` from `src/core/result.ts` using `ok()` and `fail()`. Throw only for bugs; the CLI turns a throw into `INTERNAL`.
- Every error code is declared in `src/contracts/errors.ts`, with a comment saying what it means. A message is one specific sentence; add a location, details and a hint when they help someone act.
- Every external input (files, settings, agent output) has a Zod schema in `src/contracts/` and is validated before use.
- A command is a function returning `Promise<Result<T>>` plus a renderer, wired up in `src/cli.ts`.
- Data files are JSON; prose is Markdown.
- Tests use `node:test` and sit next to the code as `*.test.ts`.
- Everything that exists needs a purpose. Don't add configuration, metadata or dependencies ahead of need.
- Credentials for the Microsoft test account are in `.env`. Never print, log or commit them.
- Commits are single-line conventional commits. Never commit `.env`, `.scratchpad/` or `artifacts/`.
