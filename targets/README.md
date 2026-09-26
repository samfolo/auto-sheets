# Targets

A target is a product the factory replicates. Each has a folder; `excel/` is Excel for the web.

```
excel/
  driver/      how to drive and read Excel: selectors, the readout parser, sign-in
  knowledge/   what we've learned about Excel, dated, and marked as observed or documented
  cases/       scenarios, and what Excel did in them
```

## Cases

A case is a folder, and its path is its id, such as `errors/division-by-zero-spreads-to-dependants`. The first folder is its area. The last folder states the behaviour as a claim in lower-case hyphenated words, so a listing reads like a specification.

| Area                | What its cases pin down                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `workflows/`        | Whole tasks end to end, such as seeding, editing, breaking and fixing a sum |
| `entry/`            | How typed text is interpreted: numbers, text, booleans, dates, percentages  |
| `arithmetic/`       | Operators and their precedence                                              |
| `references/`       | Formulas that read other cells, and recalculation when those cells change   |
| `functions/<name>/` | One folder per built-in function, such as `functions/sum/`                  |
| `errors/`           | Error values, how they spread, and formulas Excel can't parse               |
| `history/`          | Undo and redo                                                               |

Each case folder holds two files.

**`case.json`** is written by a person or the agent.

- `description`: the behaviour, in one sentence.
- `tags`: labels that cut across areas. `golden` marks the walkthrough that must pass identically on Excel and on the clone.
- `steps`: what to do, in order, starting from a blank sheet. `enter` selects a cell and types into it, replacing what was there, then presses Enter. `undo` and `redo` press the shortcuts. `observe` is a checkpoint that lists cells to record.

**`reference.json`** is written only by `factory case record`, which runs the case on Excel twice and keeps the result only if both runs agree.

- `checkpoints`: for each observe step, each cell's `raw` content (the formula bar), its `display` (what the cell shows), and `annotations` (what Excel's screen-reader readout adds, such as "Contains Formula").
- `environment`: the regional format, which changes how dates and numbers are read.

Every field is also described in its Zod schema, in `src/contracts/case.ts` and `src/contracts/reference.ts`, and validation errors quote those descriptions.

Why this shape: a case is a [characterization test](https://en.wikipedia.org/wiki/Characterization_test). Excel is the [test oracle](https://en.wikipedia.org/wiki/Test_oracle): it decides what's correct, never the case's author. Recording twice filters out results that change between identical runs, so they never become ground truth.

## Commands

- `factory case list` shows every case: ● recorded, ○ not yet.
- `factory case record <id>` records a case against Excel.
- `factory excel open | enter | observe | undo | redo` try steps by hand before writing them down.
