# Keyboard and editing

Sources:

- https://support.microsoft.com/en-us/accessibility/excel/keyboard-shortcuts-in-excel (the "Excel for the web" section, unless marked desktop)
- https://support.microsoft.com/en-us/office/foundations-experiences/undo-redo-or-repeat-an-action (Web tab)
- https://support.microsoft.com/en-us/excel/fill-a-formula-down-into-adjacent-cells (Web tab)
- https://support.microsoft.com/en-us/excel/create-or-change-a-cell-reference (Web tab)
- https://support.microsoft.com/en-us/excel/get-started/select-cell-contents-in-excel (desktop)
- https://support.microsoft.com/en-us/excel/enter-data-manually-in-worksheet-cells (desktop)
- https://support.microsoft.com/en-us/excel/move-or-copy-a-formula-in-excel
- https://support.microsoft.com/en-us/excel/excel-specifications-and-limits

Excel for the web runs in a browser, so its shortcuts differ from the desktop app's. Some browser shortcuts (such as F1 and Ctrl+O) go to the browser unless "Override browser shortcuts" is turned on (Help > Keyboard Shortcuts).

## Entering data (web)

| Key         | Effect                                                     |
| ----------- | ---------------------------------------------------------- |
| Enter       | Complete the entry and select the cell below               |
| Shift+Enter | Complete the entry and select the cell above               |
| Tab         | Complete the entry and select the next cell in the row     |
| Shift+Tab   | Complete the entry and select the previous cell in the row |
| Esc         | Cancel the entry                                           |
| Alt+Enter   | Start a new line in the same cell                          |

Desktop only: after Tab across a row, Enter at the end of the row goes to the start of the next row. The direction of Enter is a desktop setting.

## Editing a cell (web)

| Key                      | Effect                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| F2                       | Edit the selected cell                                                                   |
| F4                       | With a reference selected in a formula, cycle through absolute and relative combinations |
| Delete                   | Clear the selected cell                                                                  |
| Backspace                | Clear the selected cell and start editing                                                |
| Home / End               | Go to the start / end of the cell line                                                   |
| Shift+Left / Shift+Right | Select one character left / right                                                        |
| Shift+Home / Shift+End   | Select to the start / end of the cell data                                               |
| Ctrl+'                   | Copy the formula from the cell above                                                     |
| Ctrl+Shift+'             | Copy the value from the cell above                                                       |
| Ctrl+;                   | Insert the current date                                                                  |
| Ctrl+Shift+;             | Insert the current time                                                                  |

Desktop details, not stated for the web:

- F2 puts the insertion point at the end of the contents. While editing a formula, F2 toggles Point mode, in which the arrow keys build a reference.
- Delete removes contents (data and formulas) but not formats or notes. In edit mode it deletes the character to the right. Backspace in edit mode deletes the character to the left.
- Esc cancels an entry in the cell or the formula bar.

## Formulas with the mouse (web)

- Type `=`, then select a cell or range: it becomes a reference in the formula. Press Enter to finish.
- Double-click a formula cell: each referenced cell or range is highlighted in its own color. Drag a colored border to point the reference elsewhere, or drag a corner to resize it.

## Moving (web)

| Key                    | Effect                                      |
| ---------------------- | ------------------------------------------- |
| Arrow keys             | Move one cell                               |
| Enter / Shift+Enter    | Move down / up one cell                     |
| Tab                    | Move right one cell                         |
| Home                   | Go to the beginning of the row              |
| Ctrl+Home              | Go to A1                                    |
| Ctrl+End               | Go to the last cell of the used range       |
| Ctrl+Left / Ctrl+Right | Move to the edge of the current data region |
| Page Down / Page Up    | Move one screen (28 rows)                   |
| Ctrl+G                 | Go to a specific cell                       |

## Selecting (web)

| Key                     | Effect                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Shift+Arrow keys        | Select a range                                                                                   |
| Ctrl+Space              | Select the entire column                                                                         |
| Shift+Space             | Select the entire row                                                                            |
| Ctrl+Shift+Left / Right | Extend to the last nonblank cell in the row, or the next nonblank cell if the next cell is blank |
| Shift+F8                | Add a non-adjacent cell or range                                                                 |
| Ctrl+Shift+End / Home   | Extend to the last used cell / the first cell of the sheet                                       |

Inside a selected range (web):

- Enter moves forward (top to bottom) through the selection. Shift+Enter moves back.
- Tab moves forward through a row, or down through a one-column selection. Shift+Tab moves back.
- Shift+Backspace moves to the active cell. Ctrl+Backspace moves to it and keeps the selection.
- Ctrl+. rotates the active cell through the corners of the selection.

Ctrl+A is documented for desktop only: it selects the current region if the sheet has data, and the whole sheet on a second press.

## Mouse selection (desktop page)

- Click a cell to select it. Drag across cells to select a range.
- Shift+click selects the rectangle between the active cell and the clicked cell.
- Ctrl+click adds non-adjacent cells or ranges. You can't remove one part without cancelling the whole selection.
- Click a column letter or row number to select the entire column or row. Drag across headings, or Shift+click a second heading, for adjacent columns or rows. Ctrl+click headings for non-adjacent ones.
- The Select All button in the top-left corner selects the whole sheet.
- Clicking any cell cancels a selection.

## Filling (web)

- Ctrl+D fills down: a formula is copied down a column. Ctrl+R fills right along a row.
- Dragging the fill handle down or right fills too. Relative references adjust per row or column (see `references.md`).
- Desktop only: Ctrl+Enter fills the selected range with the current entry. In the web section, Ctrl+Enter is listed only as "Follow hyperlink".

## Copy, cut and paste (web)

- Ctrl+C copies, Ctrl+X cuts, Ctrl+V pastes. Shift+Ctrl+V pastes formatting.
- A copied formula's relative references adjust. A cut-and-pasted formula keeps its references (see `references.md`).

## Undo and redo (web)

- Excel for the web can undo and redo "basic actions". The desktop app has more advanced options.
- Ctrl+Z undoes. Press it again to undo more steps. Ctrl+Y redoes something undone.
- Ctrl+Y also repeats a simple action, such as a paste. (Repeat is also on the Home tab.)
- Some actions can't be undone, such as File commands or saving. The Undo button is then dimmed.
- Desktop: 100 undo levels by default. Running a macro clears the undo stack.
