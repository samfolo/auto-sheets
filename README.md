# auto-sheets

A software factory that replicates a slice of Excel for the web (typed entry, formulas, recalculation, errors, selection, and undo and redo) and proves the replica against recordings of the real product.

<!-- The write-up goes here. -->

## Run the clone

```sh
cd clone && npm install && npm start      # http://localhost:4321, or the port in PORT
curl -X POST localhost:4321/api/reset      # back to a blank workbook, with no undo history
```

State lives in memory only, so restarting also resets it. The clone was built by the factory, not by hand: run `2026-09-26T21-07-58-162Z-bbf4`, DeepSeek v4.1 Flash on factory 0.2.0, in 50 minutes for about $0.22. Its own notes are in [`clone/NOTES.md`](clone/NOTES.md).

## Verify it

```sh
npm install && npx playwright install chromium
./factory.sh clone check clone             # every case recorded on Excel, run on the clone
```

It passes 38 of the 39 cases it was built against; it misses one held-out case (General number format rounding to the column's width). Cases recorded after it was built are listed as failures until a new build learns them. Seeding from a workbook is in the spec but not in the clone, and no case exercises it yet.

## What the factory does

Requires Node 26. Building needs macOS (for the sandbox) and an OpenRouter key in `.env`; recording needs a Microsoft account signed in once in the factory's browser. `./factory.sh doctor` checks all of it.

| Command                               | What it does                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `./factory.sh case list`              | Lists the cases, each recorded on Excel twice and kept only if both runs agree |
| `./factory.sh case record <id>`       | Records a case on Excel                                                        |
| `./factory.sh case explore --focus …` | Generates random sequences of gestures or entries and records them             |
| `./factory.sh agent show`             | Prints exactly what the builder agent is given                                 |
| `./factory.sh build --model <id>`     | Builds a new clone from scratch in a sandbox, then checks it                   |
| `./factory.sh runs list`              | Every build: model, time, cost and score                                       |
| `./factory.sh clone check <dir>`      | Runs every case on a clone                                                     |

## Where things are

- `targets/excel/`: the cases and their recordings, what was learned about Excel, notes from its documentation, and the spec a clone is built to.
- `agents/builder/` and `standards/`: the builder's prompt, model and tools, and the standards and scaffold every clone starts from.
- `src/`: the factory itself. `AGENTS.md` explains how it's organised.
- `docs/decisions.md` and `docs/log.md`: every decision, and the reasoning and lessons behind them. `docs/evidence/` keeps the runs that shaped the design.
- `clone/`: the clone.
