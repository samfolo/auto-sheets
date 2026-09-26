# Working on the factory

This repository is the factory. Clones are built elsewhere. Landed decisions are in `docs/decisions.md`, and the reasoning behind them is in `docs/log.md`.

## Commands

- `npx factory --help` lists the CLI's commands. `npx factory doctor` checks prerequisites.
- `npm run check` type-checks, lints, checks formatting and runs the tests. Run it before every commit.
- `npm run format` formats everything with Prettier.

## Conventions

- Node runs the TypeScript directly. Use erasable syntax only (no enums, namespaces or parameter properties), and end relative imports in `.ts`.
- Functions are `const` arrow functions. The linter enforces this.
- Static values (configuration, registries, tables, fixed strings) are named in `SCREAMING_SNAKE_CASE`, such as `PATHS` and `ERROR_CODES`. Functions and Zod schemas are `camelCase`. No lint rule enforces this, so follow it by hand.
- There is one way to do each thing. Facts about the project (names, versions, paths) come from `src/core/project.ts`. Environment variables are read only in `src/contracts/environment.ts`, which the linter enforces. Small shared helpers, such as `sentence()` in `src/core/text.ts`, replace patterns that would otherwise be repeated inline.
- Each third-party library enters through one place: commander in `src/cli.ts`, pino in `src/core/telemetry.ts`, Zod in `src/contracts/`.
- Failures are values. Return a `Result` from `src/core/result.ts` using `ok()` and `fail()`. Throw only for bugs; the CLI turns a throw into `INTERNAL`.
- Every error code is declared in `src/contracts/errors.ts`, with a comment saying what it means. A message is one specific sentence; add a location, details and a hint when they help someone act.
- Every external input (files, settings, agent output, the CLI's own JSON output and telemetry) has a Zod schema in `src/contracts/`, and types are derived from the schemas. Every field carries a `.meta({ description })` saying what it's for; `validate()` in `src/contracts/validate.ts` prints that description next to each error.
- A command is a function returning `Promise<Result<T>>` plus a renderer, wired up in `src/cli.ts`.
- Data files are JSON; prose is Markdown.
- Tests use Vitest and sit next to the code as `*.test.ts`. Use `it.each` tables when cases differ only by data. Shared helpers live in `src/testing/`: `runFactory` runs the real CLI, and the `toSucceed` and `toFailWith` matchers work on both a `Result` and a CLI run. Improve a helper rather than repeating setup or assertions inline.
- Everything that exists needs a purpose. Don't add configuration, metadata or dependencies ahead of need.
- Credentials for the Microsoft test account are in `.env`. Never print, log or commit them.
- Commits are single-line conventional commits. Never commit `.env`, `.scratchpad/` or `artifacts/`.
