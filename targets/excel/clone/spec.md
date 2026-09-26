# Spec: a replica of Excel for the web's cells and formulas

The replica behaves like Excel for the web when a person enters values and formulas in a sheet: how typed text is interpreted, how formulas calculate and recalculate, which errors appear, what happens to a selection, and how undo and redo move through changes. Faithful means the same behaviour a person sees, through the same interactions.

The recorded cases in `cases/` define the behaviour. Each has a `case.json` (what a person did) and a `reference.json` (what Excel showed at each checkpoint). `knowledge/` holds what was learned about Excel while recording them, and screenshots of how its sheet looks.

The cases are checked by running them on the replica's screen exactly as they were recorded on Excel, then comparing what the replica shows with what Excel showed. A case passes only when every observed cell matches Excel's raw content, displayed text and readout annotations. The checker uses the factory's own copy of the cases, so editing `cases/` changes nothing.

## What the app must provide

### Running

- `npm install` then `npm start` serves the app at `http://localhost:4321`, or at the port in `PORT`.
- `GET /api/health` answers 200 once the app is ready.
- All workbook state is in memory. Nothing is written to disk while the app runs, and restarting it returns a blank workbook.

### Business logic behind an API

- The calculation, the workbook state and the undo history live on the server, behind an HTTP API. The screen calls the API for every change and renders what it returns; it never calculates anything itself.
- `POST /api/reset` replaces the workbook with a blank one and clears the undo history. With a JSON body `{ "seed": "<base64 .xlsx>" }` it loads that workbook instead. The checker calls this before every case.
- Design the rest of the API as you see fit, and describe it in the README.

### The screen

The checker drives the screen the way a person drives Excel, through four controls. They must exist exactly as described, because this is how the same case runs on both Excel and the replica.

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

### Interaction and look

- Beyond the four controls, implement what a person does with a sheet: click a cell to select it, drag across cells to select a range, click a row or column header to select it, click the corner to select everything, double-click or type to edit, and Enter, Tab, Escape and the arrow keys.
- Show a grid with column letters and row numbers and each cell's displayed value, looking like Excel's sheet in `knowledge/screenshots/`: gridlines, headers, the selection outline and the highlighted headers of the selection, numbers aligned right and text left, and errors as Excel shows them.
- Glide Data Grid (`@glideapps/glide-data-grid`) is recommended for the grid: it is hardened and accessible, and already handles clicking, dragging and selecting rows and columns. The four controls sit beside it.
