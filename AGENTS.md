# Working on the factory

This repository is the factory. Clones are built elsewhere. Landed decisions are in `docs/decisions.md`, and the reasoning behind them is in `docs/log.md`.

## Terms

- **Target**: the product being replicated, Excel for the web. **Clone**: the app an agent builds to behave like it; the agent's prompts call it the replica.
- **Case**: a scenario a person performs on a sheet, as semantic **steps** (select, enter, undo, observe and so on).
- **Checkpoint**: what the sheet showed at one observe step: each observed cell's raw content, displayed text and readout annotations.
- **Trajectory**: the checkpoints from running one case on one target, in order. It is what the sheet showed, not what anyone did. An agent's own sequence of actions is its **transcript**, kept in Pi's session file.
- **Reference**: Excel's trajectory for a case, recorded twice and kept only when both runs agree. It is the ground truth.
- **Verdict**: whether a clone's trajectory matches the reference, with every difference. Judging is deterministic: exact comparison, with no model involved.
- **Golden** and **held-out** are case tags: the walkthrough that must pass, and the cases kept from the agent.
- **Run** (or build): one attempt by an agent to build a clone, named after the time it started. **Workspace**: where that clone is built, beside the factory.
- **Score**: how many cases a clone passes. The **scoreboard** compares each check with the last, naming what was fixed and what broke.

## Commands

- `./factory.sh --help` lists the CLI's commands. `./factory.sh doctor` checks prerequisites.
- `npm run check` type-checks, lints, checks formatting and runs the tests. Run it before every commit.
- `npm run format` formats everything with Prettier.
- `./factory.sh browser start` launches the long-lived browser session that the Excel and case commands attach to. `./factory.sh browser inspect` lists the controls on the current page and saves a screenshot.
- `./factory.sh excel open [--seed <file>]` opens a workbook, and `./factory.sh excel do <step> …` runs one case step on it (`--help` lists the steps). `./factory.sh excel sign-in` signs the session in: the account is passwordless, so a person supplies the emailed code with `--code`.
- `./factory.sh case list` lists cases; `./factory.sh case record <id>` records one against Excel. Cases and their layout are explained in `targets/README.md`.
- `./factory.sh agent show [name]` prints exactly what an agent would be given (model, tools, task and the whole system prompt) without calling the model. Review it before any build.
- `./factory.sh build` has an agent build a clone in a new workspace beside the factory, then checks it on every case, held-out ones included. `./factory.sh runs show [run]` shows a run at a glance: outcome, time, cost and how the score moved. `./factory.sh clone check <workspace> [ids…] [--headed]` starts a workspace's clone and runs cases on it; it is the one way a person checks a clone.

## Layout

The factory is a set of vertical slices under `src/`, each owning its contract (`contract.ts`, Zod schemas), its logic, its commands (`commands.ts`), its tests and an `index.ts`. A slice imports another only through that `index.ts`. They depend on each other in one direction:

- `kernel/`: shared primitives: Result, the error registry, telemetry, project paths, the environment, validation, files.
- `cli/`: assembles the commands each slice registers; `src/main.ts` is the entry point.
- `browser/`: the long-lived browser session, fresh browsers, and inspecting pages.
- `sheet/`: driving any spreadsheet through Excel's accessible controls: steps, selection, typing, reading.
- `cases/`: case and reference files, recording against Excel, running and comparing, judging a clone.
- `clone/`: starting a clone from its workspace and scoring it.
- `agent/`: running an agent through Pi's SDK, its harness tools and its scoreboard.
- `build/`: a build's workspace, its run and its summary.
- `doctor/`: prerequisite checks.

Outside `src/`:

- `agents/<name>/` defines an agent: `agent.json` (model, tools, context, budget), `system.md` (who it is and how it works) and `task.md`.
- `standards/` says what good work looks like for any agent and target: `code.md` is the judgement tooling can't enforce, given to agents as context; `scaffold/` is what tooling can enforce, copied into every workspace.
- `targets/excel/` holds what is specific to Excel: its driver, knowledge, cases and the clone's spec.

## Conventions

- Node runs the TypeScript directly. Use erasable syntax only (no enums, namespaces or parameter properties), and end relative imports in `.ts`.
- Functions are `const` arrow functions. The linter enforces this.
- Static values (configuration, registries, tables, fixed strings) are named in `SCREAMING_SNAKE_CASE`, such as `PATHS` and `ERROR_CODES`. Functions and Zod schemas are `camelCase`. No lint rule enforces this, so follow it by hand.
- There is one way to do each thing. Facts about the project (names, versions, paths) come from `src/kernel/project.ts`. Environment variables are read only in `src/kernel/environment.ts`, which the linter enforces. Small shared helpers, such as `sentence()` in `src/kernel/text.ts`, replace patterns that would otherwise be repeated inline.
- Driving a spreadsheet is shared by every target, in `src/sheet/`. Every action states whether it may be repeated: reads freely, typing after Escape, and changes to the undo history only when the sheet provably didn't change. Log retries with the Trace a command receives.
- Each third-party library enters through one place: commander in `src/cli/`, pino in `src/kernel/telemetry.ts`, Zod in each slice's `contract.ts`, Playwright in `src/browser/`, `src/sheet/` and the target drivers, and Pi in `src/agent/`. Code that throws (Node, Playwright) is wrapped with `attempt()` from `src/kernel/attempt.ts` so failures come back as Results.
- Failures are values. Return a `Result` from `src/kernel/result.ts` using `ok()` and `fail()`. Throw only for bugs; the CLI turns a throw into `INTERNAL`.
- Every error code is declared in `src/kernel/errors.ts`, with a comment saying what it means. A message is one specific sentence; add a location, details and a hint when they help someone act.
- Every external input and output (files, settings, agent output, run summaries, the CLI's own JSON output and telemetry) has a Zod schema in its slice's `contract.ts`, and its type is inferred from the schema with `z.output`, never declared a second time as an interface. Every field carries a `.meta({ description })` saying what it's for; `validate()` in `src/kernel/validate.ts` prints that description next to each error.
- A command is a function returning `Promise<Result<T>>` plus a renderer, registered by its slice's `commands.ts`.
- Data files are JSON; prose is Markdown.
- Tests use Vitest and sit next to the code as `*.test.ts`. Use `it.each` tables when cases differ only by data. Shared helpers live in `src/testing/`: `runFactory` runs the real CLI, and the `toSucceed` and `toFailWith` matchers work on both a `Result` and a CLI run. Improve a helper rather than repeating setup or assertions inline.
- Everything that exists needs a purpose. Don't add configuration, metadata or dependencies ahead of need.
- Credentials for the Microsoft test account are in `.env`. Never print, log or commit them.
- Commits are single-line conventional commits. Never commit `.env`, `.scratchpad/` or `artifacts/`.
