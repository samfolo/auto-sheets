# Targets

A target is a product the factory replicates. Each has a folder; `excel/` is Excel for the web.

```
excel/
  driver/      Excel's selectors, how it opens and uploads workbooks, and sign-in
  knowledge/   what we've learned about Excel, dated, and marked as observed or documented
  cases/       scenarios, and what Excel did in them
```

How a sheet is driven (select, type, press, read) is shared by every target, in `src/sheet/`.

## Cases

A case is a folder, and its path is its id, such as `errors/division-by-zero-spreads-to-dependants`. The first folder is its area. The last folder states the behaviour as a claim in lower-case hyphenated words, so a listing reads like a specification.

| Area                | What its cases pin down                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `workflows/`        | Whole tasks end to end, such as totalling a budget and breaking and fixing it |
| `entry/`            | How typed text is interpreted: numbers, text, booleans, dates, percentages    |
| `arithmetic/`       | Operators and their precedence                                                |
| `references/`       | References to other cells: recalculation, and how fill and paste move them    |
| `functions/<name>/` | One folder per built-in function, such as `functions/sum/`                    |
| `errors/`           | Error values, how they spread, and formulas Excel can't parse                 |
| `history/`          | Undo and redo, including which operations count as one step                   |

Each case folder holds up to three files.

**`case.json`** is written by a person or the agent.

- `description`: the behaviour, in one sentence. It's a hypothesis until the case is recorded.
- `tags`: labels that cut across areas. `golden` marks the walkthrough that must pass identically on Excel and on the clone.
- `steps`: what a person does, in order: `select`, `enter`, `enter-in-selection`, `clear`, `fill-down`, `copy`, `paste`, `undo` and `redo`. `observe` is a checkpoint listing cells to record. `factory excel do --help` describes each step.

**`seed.xlsx`** is optional: a workbook the case starts from instead of a blank sheet.

**`reference.json`** is written only by `factory case record`, which runs the case on Excel twice and keeps the result only if both runs agree.

- `checkpoints`: for each observe step, each cell's `raw` content (the formula bar), its `display` (what the cell shows), and `annotations` (what Excel's screen-reader readout adds, such as "Contains Formula").
- `environment`: the regional format, which changes how dates and numbers are read.

Every field is also described in its Zod schema, in `src/contracts/case.ts` and `src/contracts/reference.ts`, and validation errors quote those descriptions.

Why this shape: a case is a [characterization test](https://en.wikipedia.org/wiki/Characterization_test). Excel is the [test oracle](https://en.wikipedia.org/wiki/Test_oracle): it decides what's correct, never the case's author. Recording twice filters out results that change between identical runs, so they never become ground truth.

## Commands

- `factory case list` shows every case: ● recorded, ○ not yet. `factory case record <id>` records one.
- `factory excel open [--seed <file>]` then `factory excel do <step> …` try steps by hand before writing them down.
