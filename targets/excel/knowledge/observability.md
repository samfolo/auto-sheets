# Observing Excel for the web

Observed on 26 September 2026 with Playwright 1.63 (Chromium), signed in to the test account. These are observations, not documentation. Re-check them if Excel changes.

## Environment

- Excel runs at `https://excel.cloud.microsoft/`. A new blank workbook opens at `/open/onedrive/?docId=…`, and the editor runs inside an iframe named `WacFrame_Excel_0`, served from `excel.officeapps.live.com`.
- Sign-in is passwordless: Microsoft emails a six-digit code. With a persistent browser profile, the session survives a browser restart.
- The browser locale was `en-GB`, yet `1/2` was read as 2 January (month first). Regional parsing follows the account, not the browser, so record the locale with every observation.

## Controls inside the editor iframe

| Purpose             | Selector                                     | Notes                                                                                 |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Name Box (address)  | `#FormulaBar-NameBox-input`                  | A combobox. Its accessible name is wrapped in invisible U+200E marks, so match by id. |
| Formula bar         | `#formulaBarTextDivId_textElement`           | Editable text. Holds the active cell's raw content.                                   |
| Grid keyboard input | `#gridKeyboardContentEditable_textElement`   | Receives keystrokes typed into the grid.                                              |
| Active-cell readout | `#m_excelWebRenderer_ewaCtl_readoutElement1` | Its `aria-label` describes the active cell for screen readers.                        |

The grid is drawn on canvas elements, so there are no cell elements to read.

## Reading a cell

Navigate with the Name Box, then read the formula bar (raw content) and the readout. The readout's format is `<display> . <address> . <annotations> . `:

- `5 . A3 . Contains Formula . `
- `#DIV/0! . B2 . Contains error . `
- `=1+ . D1 . The formula in this cell contains an error. . `
- `C5 . ` for an empty cell

The display is the text shown in the cell. The readout doesn't say whether a value is a number or text.

## Entering content

- Typing into the grid straight after navigating sometimes drops keystrokes. Entering through the formula bar (click it, type, press Enter) worked 12 times out of 12, at about 0.8 seconds per entry, but every one of those cells was empty. Later the same day, overwriting a cell that already had content through the formula bar failed reliably: the old value stayed, although the formula bar showed the new text and the selection moved. Selecting the cell and typing into it, which replaces its content, overwrote correctly 5 times out of 5. While a cell is being edited, the grid's keyboard element holds the typed text (spaces as U+00A0), so it can be checked before pressing Enter.
- Undo and redo are Cmd+Z and Cmd+Y (`ControlOrMeta` in Playwright) with the grid focused. Both restored the raw content and the recalculated dependants.
- An edit followed by a read takes about 1.4 seconds.

## Single observations, to be confirmed by recorded cases

| Typed      | Raw afterwards | Displayed  |
| ---------- | -------------- | ---------- |
| `001`      | `1`            | `1`        |
| `1.0`      | `1`            | `1`        |
| `TRUE`     | `TRUE`         | `TRUE`     |
| `1/2`      | `1/2/2026`     | `2-Jan`    |
| `50%`      | `50%`          | `50%`      |
| `'007`     | `'007`         | `007`      |
| `1e3`      | `1000`         | `1.00E+03` |
| `(5)`      | `-5`           | `-5`       |
| `  7  `    | `7`            | `7`        |
| ` x`       | ` x`           | ` x`       |
| `0.1+0.2`  | `0.1+0.2`      | `0.1+0.2`  |
| `=0.1+0.2` | `=0.1+0.2`     | `0.3`      |
| `=-2^2`    | `=-2^2`        | `4`        |
| `="a"&1`   | `="a"&1`       | `a1`       |

- An invalid formula such as `=1+` is accepted with no dialog. It's stored as typed, drawn with a red dashed border, and the readout says the formula contains an error.
- `=SUM(1,2` was completed to `=SUM(1,2)` (showing 3) on later tries. The one time it left the cell empty was probably the dropped entry described below.
- Under automation, the same input doesn't always produce the same result. A recorder must detect its own failures rather than trust a single run.

## Opening a new workbook

Observed 26 September 2026, later the same day.

- "Create blank workbook" first opens the workbook in a temporary editor. A few seconds later Excel saves it to OneDrive, moves the page to `/open/onedrive/?docId=…`, and starts a new editor. Anything typed into the first editor is lost.
- Even after the page moves, the new editor keeps loading helper frames for a few more seconds; the clipboard frame (`shared.officeapps.live.com/clipboard/`) comes last. An entry made before then can be dropped too.
- A dropped entry looks like a successful one: the selection still moves down after Enter. The cell is simply empty afterwards. Only reading the cell back shows it.
- So the driver waits for the saved address and the clipboard frame, pauses, and then confirms every entry. The typed text must be in the cell editor before Enter, the selection must reach the cell below, and non-blank text must leave the cell non-empty. Otherwise it retries once. A lost overwrite, where the old value stays, gets past these checks; recording twice is what catches it.

## Selections, operations and files

Observed 26 September 2026, in the afternoon.

- Typing a range such as `B1:B3` into the Name Box selects it. The Name Box then shows the active cell (`B1`), and the readout switches format: `1 . Selected range . B1:B3 . ` gives the active cell's display, the words "Selected range", the range, then any annotations.
- The readout has no label at all until the first selection in a newly opened workbook, and the first selection after a browser restart can fail to take. Selecting again works.
- Ctrl+Enter puts the typed text in every selected cell. It is Ctrl+Enter even on a Mac; Cmd+Enter only fills the active cell. One undo reverts all the cells.
- Delete clears every selected cell, and one undo restores them all.
- Cmd+D (Ctrl+D elsewhere) fills the top row of the selection down, adjusting relative references: `=B1*2` becomes `=B2*2` and `=B3*2`.
- Copy and paste (Cmd+C, Cmd+V) work within the sheet. The browser is launched with clipboard permission.
- The status bar's totals for a selection are not exposed as readable text.
- File, then Create a Copy, then Download a Copy downloads the workbook as `.xlsx`. The file keeps each formula (`<f>`) with its last computed value (`<v>`) and each cell's type, which the readout can't give.
- "Upload a file" on the Excel home page opens a file chooser. Playwright can hand it a file directly, with no folder navigation, and Excel then opens the uploaded workbook. This is how a case's seed workbook is loaded.
- Every blank workbook and upload is saved to the test account's OneDrive, so workbooks accumulate (Book 1 to Book 37 by mid-afternoon).
