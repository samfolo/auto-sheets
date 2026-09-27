# Replica: Excel for the web — cells and formulas

## Architecture

- `src/engine/` — pure rules, no UI/HTTP: addresses, entry parsing, number/date display,
  formula parser + evaluator, workbook (cells, undo, fill, copy/paste), selection model.
- `src/server/` — Node HTTP server (native type stripping). Holds workbook state, calc and
  undo history behind `/api`. Serves the client through Vite middleware.
- `src/client/` — React screen: grid, Name Box, formula bar, cell editor, readout.
  Selection and editing state live on the client (instant readout/name-box updates,
  like Excel's screen); every content change goes to the server API.

## Rules inferred from cases

- Entry normalisation: `001`→1, `1.0`→1, `(5)`→-5, `1e3`→1000 shown `1.00E+03`
  (typed E-notation gives a 2-decimal scientific cell format), `50%`→0.5 shown `50%`,
  `'007`→text (raw keeps apostrophe), `TRUE`→boolean, `  7  `→7, `1/2`→date
  (month-first, current year; raw `1/2/2026`, display `2-Jan`).
- General display: plain up to 11 significant digits; 12+ digit numbers go scientific
  (`1.23457E+19`, 5 decimals trimmed).
- Formulas: unary minus before `^` (`=-2^2`=4), `^` left-assoc (`=2^3^2`=64). Errors
  (#DIV/0! etc.) propagate through arithmetic and SUM. Broken formulas (`=1+`) are kept
  as typed, flagged "The formula in this cell contains an error."; missing close-parens
  are auto-completed (`=SUM(1,2` → `=SUM(1,2)`).
- Undo/redo: per change; multi-cell changes (Delete, Ctrl+Enter, fill, paste) are one
  step. Selection is never part of the undo history.
- Fill-down / paste shift relative references only; `$` parts stay; out-of-grid → #REF!.
- Selection: areas list; Command-click/drag toggles (subtracts when the gesture start is
  already selected). Subtraction fragments each area in order: below, right, left, above.
  After a subtraction the active cell becomes the top-left of the area that held it.
  Command+A replaces the area containing the active cell with A:XFD, keeping the active
  cell; the corner click selects all but makes A1 active.
- Enter/Tab move the active cell inside a kept selection; arrows collapse and move.
  Shift+arrows grow/shrink from the active cell (focus corner moves).

## Open questions

- Display of dates typed with a year (guessed `5-Sep-2002`).
- Shift+drag from a row header onto a cell gives `<activeCol>:XFD x rows` (one recording).
- Ctrl+Enter with a formula adjusts relative references per cell (documented, unrecorded).
