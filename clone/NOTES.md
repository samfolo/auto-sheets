# Replica of Excel for the web: cells and formulas

A single Node process serves a React screen over the engine's HTTP API. The screen renders
only what the server returns; the engine holds every rule. The API is one `POST /api/action`
per gesture plus `GET /api/state`, `GET /api/health` and `POST /api/reset`.

## Rules inferred from the cases

### Entry / interpretation (`entry/`, `errors/`)

- `=...` is a formula. A formula whose parentheses are unbalanced is completed at commit
  (`=SUM(1,2` -> `=SUM(1,2)`). A formula with a dangling operator (`=1+`) is kept as typed,
  shows its own text, and is annotated `The formula in this cell contains an error.`.
- A valid formula is annotated `Contains Formula`; a formula that evaluates to an error is
  annotated `Contains error` and displays the error text.
- Numbers are normalised: `001`->`1`, `1.0`->`1`, `(5)`->`-5`; `1e3`-> raw `1000` displayed
  `1.00E+03` (typing E-notation applies the Scientific format); `50%` -> raw `50%` displayed
  `50%` (typing `%` applies the Percentage format); `'007` -> raw `'007`, displayed `007`;
  `TRUE` -> raw/display `TRUE`.
- General display rounds to ~11 significant digits (`=0.1+0.2` -> `0.3`); 12+ digits use
  scientific.

### Formula arithmetic (`arithmetic/`)

- Precedence: reference ops, unary minus, `%`, `^`, `*`/`/`, `+`/`-`, `&`, comparisons.
- `=-2^2` = 4 (unary minus before `^`); `=0-2^2` = -4; `=2^3^2` = 64 (`^` left to right).

### Errors (`errors/`)

- `=1/0` -> `#DIV/0!`, and errors propagate through arithmetic and `SUM` to dependants.

### References (`references/`)

- Copy/paste and fill-down shift relative reference parts by the offset; absolute parts
  (`$`) stay.

### History (`history/`)

- An entry is one undo step. Ctrl+Enter into a selection and Delete over a selection are one
  step each. Undo/redo restore inputs and re-calculated dependants. Selecting is not in the
  history, so undo leaves the current selection alone.

### Selection (`selection/`, `explore/`)

- Click a cell -> single cell. Drag cells -> rectangle with the drag start active. Headers ->
  whole column/row ranges. Corner -> `A:XFD` with `A1` active. Cmd+A -> `A:XFD` keeping the
  active cell (multi-area keeps earlier areas and replaces the last with `A:XFD`).
- Shift+click / Shift+drag extend from the anchor (active) cell, anchor stays active.
  Shift+arrows grow/shrink the selection from the anchor.
- Cmd+click adds a non-adjacent area; Cmd+clicking something already selected removes it
  (subtracting the rectangle from every area, in the order below/right/left/above).
- A Cmd drag decides add or subtract from the start: a cell drag toggles when its start cell
  is selected, a header drag when the start header's whole column or row is selected.
- A Shift drag that starts on a header extends the anchor's row or column toward the pointer,
  never past the anchor, and runs to the sheet's edge when the pointer goes behind the anchor
  (inferred from `explore/seed-1-2`, the only recording of it).

## What is built and what passes

- **All 37 recorded cases match the original**, and `npm run check` (typecheck, lint,
  formatting and tests) is clean.
- The engine covers: entry interpretation (numbers, percentages, E-notation, apostrophes,
  dates, booleans, errors), formula parsing with Excel's precedence, the worksheet functions
  (SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, ROUND, ABS, AND, OR, NOT), error propagation,
  relative/absolute reference shifting for copy, paste and fill-down, the undo history, and
  the selection rules (cells, ranges, headers, corner, Ctrl+A, Shift extension, Ctrl+click
  areas with rectangle subtraction).
- `src/engine/engine.test.ts` covers the entry, formula, error, reference and history rules
  with tables of cases.

## What I would do next

- Implement the `seed` in `POST /api/reset`: reading `.xlsx` needs a zip/XML reader, and no
  recorded case uses one, so the body is accepted but the sheet is left blank.
- The `explore/areas-*` rules came from few recordings; more recordings would confirm the
  rectangle arithmetic and the active cell after a subtraction.

## Choices

- The grid is a plain HTML grid rather than Glide Data Grid. Glide is canvas-based, which
  would hide the cell elements the layout needs and make keyboard/mouse handling heavier;
  an HTML grid keeps the cells addressable and the interactions explicit.
- Vite runs in middleware mode inside the single `npm start` Node server so one process
  serves both the API and the screen on one port.
