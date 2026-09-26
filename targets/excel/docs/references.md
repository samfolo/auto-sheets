# Cell references

Sources:

- https://support.microsoft.com/en-us/excel/get-started/overview-of-formulas-in-excel
- https://support.microsoft.com/en-us/excel/switch-between-relative-absolute-and-mixed-references (applies to Excel for the web)
- https://support.microsoft.com/en-us/excel/create-or-change-a-cell-reference (has a Web tab)
- https://support.microsoft.com/en-us/excel/move-or-copy-a-formula-in-excel (has a Web tab)
- https://support.microsoft.com/en-us/excel/fill-a-formula-down-into-adjacent-cells (has a Web tab)
- https://support.microsoft.com/en-us/excel/multiply-by-a-percentage-in-excel (has a Web tab)
- https://support.microsoft.com/en-us/excel/how-to-correct-a-ref-error
- https://support.microsoft.com/en-us/excel/functions/sum-function
- https://support.microsoft.com/en-us/excel/how-to-avoid-broken-formulas-in-excel
- https://support.microsoft.com/en-us/excel/excel-specifications-and-limits

## A1 style

- Columns are letters, A to XFD (16,384 columns). Rows are numbers, 1 to 1,048,576.
- A cell is its column letter then its row number. `B2` is column B, row 2.

| To refer to                   | Use       |
| ----------------------------- | --------- |
| The cell in column A, row 10  | `A10`     |
| Column A, rows 10 to 20       | `A10:A20` |
| Row 15, columns B to E        | `B15:E15` |
| All of row 5                  | `5:5`     |
| Rows 5 to 10                  | `5:10`    |
| All of column H               | `H:H`     |
| Columns H to J                | `H:J`     |
| Columns A to E, rows 10 to 20 | `A10:E20` |

- A range is the first cell, a colon, then the last cell. A missing colon gives #NAME?.
- Another sheet: `=Sheet2!B2`. The `!` separates the sheet from the cell.
- Quote a sheet name that has spaces or other non-letters: `='January Revenue'!A1`, `='123'!A1`. Without the quotes: #NAME?.
- The "Create or change a cell reference" page says entering `=A1:F4` with Ctrl+Shift+Enter (a legacy array formula) "doesn't work in Excel for the web". In current Microsoft 365, a formula entered with Enter can return several values and spill (see #SPILL! in `error-values.md`).

## Relative, absolute and mixed

| Type                   | Form   | When copied or filled      |
| ---------------------- | ------ | -------------------------- |
| Relative               | `A1`   | Column and row both adjust |
| Absolute               | `$A$1` | Nothing adjusts            |
| Mixed, absolute column | `$A1`  | Column stays, row adjusts  |
| Mixed, absolute row    | `A$1`  | Row stays, column adjusts  |

- New formulas use relative references by default.
- A relative reference is a position relative to the formula's cell. `A2` in a formula in `C2` means "two columns left, same row".
- F4 switches the selected reference in a formula between the types. This is documented for both Windows and the web.

## How references change when a formula is copied, filled or pasted

A formula copied two cells down and two cells right:

| Reference | Becomes |
| --------- | ------- |
| `$A$1`    | `$A$1`  |
| `A$1`     | `C$1`   |
| `$A1`     | `$A3`   |
| `A1`      | `C3`    |

The documented examples all fit one rule: each relative part moves by the same number of rows and columns as the formula did. Absolute parts never move.

- `=B4*C4` in D4, copied to D5, becomes `=B5*C5`. `=$B$4*$C$4` stays the same.
- `=A1` in B2, copied or filled to B3, becomes `=A2`. `=$A$1` stays `=$A$1`.
- `=A$1` copied from A2 to B3 becomes `=B$1`.
- Excel for the web (Web tab): `=A2*$C$2` in B2 dragged down to B3 keeps pointing at C2. Without the `$` signs, Excel for the web would make it `=A3*C3`.
- Filling works like copying. Drag the fill handle, or press Ctrl+D (fill down) or Ctrl+R (fill right). Both keys are documented on the Web tab.
- Moving a formula (cut and paste, or dragging the cell's border) keeps every reference exactly the same, whatever its type. This is stated on the Windows tab. The Web tab only says to check the references still point where you want.
- Paste Special > Formulas pastes only the formula. Paste Special > Values pastes only the results.

## When referenced cells go away or change

- Deleting a column that a formula names cell by cell gives #REF!. `=SUM(B2,C2,D2)` becomes `=SUM(B2,#REF!,C2)` when column C is deleted.
- Likewise `=A2+B2+C2` becomes `=A2+#REF!+B2` when a referenced column is deleted.
- A range reference adjusts instead. `=SUM(B2:D2)` survives deleting a column inside the range.
- Inserting a column inside a range expands it: `=SUM(A2:C2)` becomes `=SUM(A2:D2)`. A formula like `=A2+B2+C2` doesn't pick up inserted rows or columns.
- Pasting moved cells on top of cells that formulas refer to also gives #REF!.
- A formula that refers to a deleted worksheet gives #REF!.

## Limits

- 1,048,576 rows by 16,384 columns.
- Formula contents up to 8,192 characters.
- Up to 255 arguments in a function. Up to 64 nested levels of functions.
