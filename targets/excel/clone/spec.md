# A clone of Excel for the web: cells and formulas

You are building a small web app that behaves like Excel for the web when a person enters values and formulas in a sheet: how typed text is interpreted, how formulas calculate and recalculate, which errors appear, what happens to a selection, and how undo and redo move through changes. Faithful means the same behaviour, not the same pixels.

The recorded cases in `cases/` define the behaviour. Each has a `case.json` (what a person did) and a `reference.json` (what Excel showed at each checkpoint). `knowledge/` holds what was learned about Excel while recording them. Read both before designing anything.

## How your clone is checked

`./factory case verify --url http://localhost:4321` runs every recorded case on your app, through its screen, exactly as the cases were recorded on Excel. It then compares what your app shows with what Excel showed. A case passes only when every observed cell matches Excel's raw content, displayed text and readout annotations. `--help` shows how to run one case and how to read the differences it reports.

The checker uses the factory's own copy of the cases, so editing `cases/` changes nothing.

## What the app must provide

### Running

- `npm install` then `npm start` serves the app at `http://localhost:4321`, or at the port in `PORT`.
- `GET /api/health` answers 200 once the app is ready.
- TypeScript throughout. Well-tested libraries are allowed; record why you chose each one in your notes.
- All workbook state is in memory. Nothing is written to disk while the app runs, and restarting it returns a blank workbook.

### Business logic behind an API

- The calculation, the workbook state and the undo history live on the server, behind an HTTP API. The screen calls the API for every change and renders what it returns; it never calculates anything itself.
- `POST /api/reset` replaces the workbook with a blank one and clears the undo history. With a JSON body `{ "seed": "<base64 .xlsx>" }` it loads that workbook instead. The checker calls this before every case.
- Design the rest of the API as you see fit, and describe it in your README.

### The screen

The checker drives your screen the way a keyboard user drives Excel, through four controls. They must exist exactly as described, because this is how the same case runs on both Excel and your clone.

| Control     | Element                                                                      | Behaviour                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name Box    | `<input id="name-box" aria-label="Name Box">`                                | Shows the active cell's address. Typing a cell or range (`B2`, `B2:C4`) and pressing Enter selects it; the active cell becomes the range's first cell.                                          |
| Formula bar | an element with `id="formula-bar"`                                           | Its text is the active cell's raw content: the formula for a formula, the value as stored otherwise.                                                                                            |
| Cell editor | a focusable element with `id="cell-editor"`, such as a `contenteditable` div | Receives keystrokes aimed at the grid. Typing while a cell is selected starts editing and replaces the cell's content; while editing, the element's text is exactly what has been typed so far. |
| Readout     | an element with `id="readout"`                                               | Its `aria-label` describes the selection in Excel's screen-reader format, below. It changes whenever the selection or the active cell's content changes.                                        |

Readout format, exactly as Excel produces it:

- one cell: `<display> . <address> . <annotation> . `, such as `5 . A3 . Contains Formula . `, with the display left out for an empty cell: `C5 . `;
- a range: `<display of the active cell> . Selected range . <range> . <annotation> . `, such as `1 . Selected range . B1:B3 . `.

The annotations seen so far are `Contains Formula`, `Contains error`, and `The formula in this cell contains an error.`; the references show which appears when.

Keys, with the cell editor focused:

| Key                            | Effect                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Enter                          | Commits the edit and moves the selection down one cell.                              |
| Escape                         | Cancels the edit.                                                                    |
| Ctrl+Enter (on every system)   | Commits the typed text into every selected cell, as one change.                      |
| Delete                         | Clears every selected cell, as one change.                                           |
| Ctrl+D / Cmd+D                 | Fills the top row of the selection down, adjusting relative references.              |
| Ctrl+C / Cmd+C, Ctrl+V / Cmd+V | Copies the selection, and pastes it at the selection, adjusting relative references. |
| Ctrl+Z / Cmd+Z, Ctrl+Y / Cmd+Y | Undo and redo, one change at a time.                                                 |

Show a grid with column letters and row numbers, and each cell's displayed value. Everything else about its look is up to you.

## How to work

- Start by reading the cases and references, and write down the behaviour they pin down before choosing a design.
- Run the checker early and often, and commit each state that passes more cases than the last.
- If the same case keeps failing after a couple of fixes, stop editing. Write down why the design resists the fix, and consider changing the design rather than adding a special case.
- Never make a case pass by recognising its particular inputs. The references show Excel's general behaviour, and cases you haven't seen will test the same rules.
