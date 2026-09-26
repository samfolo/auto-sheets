# Error values

Sources:

- https://support.microsoft.com/en-us/excel/detect-formula-errors-in-excel
- https://support.microsoft.com/en-us/excel/how-to-avoid-broken-formulas-in-excel
- https://support.microsoft.com/en-us/excel/how-to-correct-a-div-0-error
- https://support.microsoft.com/en-us/excel/how-to-correct-a-value-error
- https://support.microsoft.com/en-us/excel/how-to-correct-a-value-error-in-average-or-sum-functions
- https://support.microsoft.com/en-us/excel/how-to-correct-a-ref-error
- https://support.microsoft.com/en-us/excel/how-to-correct-a-name-error
- https://support.microsoft.com/en-us/excel/how-to-correct-a-n-a-error
- https://support.microsoft.com/en-us/excel/how-to-correct-a-num-error
- https://support.microsoft.com/en-us/excel/correct-a-null-error (applies to Excel for the web)
- https://support.microsoft.com/en-us/excel/how-to-correct-a-spill-error
- https://support.microsoft.com/en-us/excel/calculation-operators-and-precedence-in-excel
- https://support.microsoft.com/en-us/excel/functions/sum-function
- https://support.microsoft.com/en-us/excel/excel-specifications-and-limits

## The values

Formula error values are #DIV/0!, #N/A, #NAME?, #NULL!, #NUM!, #REF! and #VALUE!. #SPILL! appears only when a formula returns several results.

`#####` is not an error value. It means the column is too narrow to show a number or date, or the cell holds a negative date or time.

## How errors propagate

- An error value typed directly into a cell is stored as that error value. A formula that refers to that cell returns that error.
- SUM or AVERAGE over cells that contain #VALUE! returns #VALUE!. The page says the same workaround covers #N/A, #NULL! and #DIV/0!.
- A SUM total over cells that hold #N/A returns #N/A. Cells with #N/A or `NA()` make every formula that refers to them return #N/A.
- Typing #N/A into the divisor cell of a division makes the result #N/A instead of #DIV/0!.
- AVERAGE, MIN and MAX: "Arguments that are error values ... cause errors."
- COUNT does not count error values, whether typed as arguments or found in references. COUNTA counts cells that hold errors.
- `IFERROR(formula, value)` returns `value` for any error, not only one kind.
- `=IF(A3,A2/A3,0)` avoids #DIV/0!: when A3 is 0 or empty, IF takes the false branch.

## #DIV/0!

- "a number is divided by zero (0)", or by a cell that contains no value.
- `=5/0` gives it. So does a formula whose divisor cell holds 0 or is blank.

## #VALUE!

- "There's something wrong with the way your formula is typed. Or, there's something wrong with the cells you are referencing." The page calls it very general.
- Math operators on cells that hold text: `=A1+B1+C1` gives #VALUE! if a cell holds text. SUM ignores the text.
- A cell holding only spaces looks blank but isn't. `=E2+E3+E4+E5` gives #VALUE! when E2 holds a hidden space.
- Text that can't become a number where a number is needed: `=SQRT("8+1")`.
- Functions given the wrong type of argument may return #VALUE!.
- AND and OR over a range with no logical values return #VALUE!.

## #REF!

- "a formula refers to a cell that's not valid". This usually means referenced cells were deleted or pasted over.
- Deleting a referenced column: `=SUM(B2,C2,D2)` becomes `=SUM(B2,#REF!,C2)`. The `#REF!` is written into the formula text.
- Range references adjust instead: `=SUM(B2:D2)` survives the deletion.
- Asking for a position outside a range: `=INDEX(B2:E5,5,5)` on a 4-by-4 range.
- Referring to a deleted worksheet.

## #NAME?

- "Excel does not recognize text in a formula." Causes listed:
  - A misspelled function name (the top reason).
  - A name that isn't defined, or a misspelled defined name.
  - Text without double quotes.
  - A range missing its colon.
  - `x` used as the multiplication sign with cell references.
  - A sheet name with a space, not in single quotes.
  - A function that needs an add-in that isn't enabled.

## #N/A

- "a value is not available to a function or formula".
- Most often a lookup (VLOOKUP, MATCH and similar) can't find the value it was asked for.
- Typed #N/A or `NA()` in cells passes on to formulas that refer to them.

## #NUM!

- "a formula or function contains numeric values that aren't valid".
- An iterating function (such as IRR or RATE) can't find a result.
- A result too large or too small to show. The #NUM! page says to keep results between `-1*10^307` and `1*10^307`.
- The limits page lists the largest number allowed via a formula as 1.7976931348623158e+308 (and its negative), and the smallest positive number as 2.2251E-308. The two pages disagree, so trust the recorded cases.

## #NULL!

- An incorrect range operator, or a space (the intersection operator) between ranges that don't intersect.
- `=SUM(A1 A5)` and `=SUM(C2:C3 E4:E6)` give #NULL!. Use `:` for a range and `,` for a union: `=SUM(C2:C3,E4:E6)`.
- Ranges that do intersect work: `=CELL("address",(A1:A5 A3:C3))` returns the address of A3.

## #SPILL!

Only relevant if the clone lets one formula return several results (for example `=A1:A3`).

- The formula returns several results but Excel can't put them in the grid.
- Causes: the spill range isn't blank; the results would go past the sheet's edge; the range includes merged cells; the formula is in a table; the size keeps changing (for example `=SEQUENCE(RANDBETWEEN(1,1000))`); out of memory.
- Selecting the cell shows a dashed border around the intended spill range. The error clears as soon as the obstruction is cleared.
