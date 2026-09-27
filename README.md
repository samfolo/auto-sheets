# auto-sheets

A software factory that replicates a slice of Excel for the web (typed entry, formulas, recalculation, errors, selection, and undo and redo) and proves the replica against recordings of the real product.

The write-up, on the approach, how AI was used, verification and what comes next, is in [`WRITEUP.md`](WRITEUP.md).

## Run the clone

```sh
cd clone && npm install && npm start      # http://localhost:4321, or the port in PORT
curl -X POST localhost:4321/api/reset      # back to a blank workbook, with no undo history
```

State lives in memory only, so restarting also resets it.

The clone was built by the factory, not by hand, and is kept exactly as built: Kimi K3 on factory 0.2.0, run `2026-09-26T21-09-30-433Z-4023`, for about $5.84. It passed all 37 cases it could see at checkpoint `4cc2228`; a lint sweep afterwards stopped its page rendering, and the run ended before the agent noticed, so this is that checkpoint, restored. Its notes on the rules it inferred are in [`clone/NOTES.md`](clone/NOTES.md).

## Verify it

```sh
npm install && npx playwright install chromium
./factory.sh clone check clone             # every case recorded on Excel, run on the clone
```

It passes 42 of the 48 recorded cases, including cases recorded after it was built. It fails:

- one held-out case: Excel's General format rounds a number to fit its column, and the clone doesn't;
- four behaviours recorded after it was built: entering through the formula bar, the formula bar during a selection, the Name Box during a drag (the selection follows the pointer, but Excel's Name Box shows its size, such as `3R x 3C`, and the clone's shows the active cell), and two of the five explored entry sequences.

Known issues the cases don't cover: the active cell hides its own value (the formula bar shows it); the row headers scroll away horizontally, and the cell being edited draws over the column headers when scrolled; seeding from a workbook, which the spec asks for, isn't implemented; and the clone has no README of its own, which the spec also asks for.

## What the factory does

Requires Node 26. Building needs macOS (for the sandbox) and an OpenRouter key in `.env` (`.env.example` lists the variables); recording needs a Microsoft account signed in once in the factory's browser. `./factory.sh doctor` checks all of it.

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
