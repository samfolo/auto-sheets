# Functions

Sources:

- https://support.microsoft.com/en-us/excel/functions/sum-function
- https://learn.microsoft.com/en-us/office/vba/api/excel.worksheetfunction.sum (the support page has no remarks on argument types; this page does)
- https://support.microsoft.com/en-us/excel/functions/average-function
- https://learn.microsoft.com/en-us/office/vba/api/excel.worksheetfunction.average
- https://support.microsoft.com/en-us/excel/functions/min-function
- https://support.microsoft.com/en-us/excel/functions/max-function
- https://support.microsoft.com/en-us/excel/functions/count-function
- https://support.microsoft.com/en-us/excel/functions/counta-function
- https://support.microsoft.com/en-us/excel/functions/if-function
- https://support.microsoft.com/en-us/excel/functions/round-function
- https://support.microsoft.com/en-us/excel/functions/abs-function
- https://support.microsoft.com/en-us/excel/functions/and-function
- https://support.microsoft.com/en-us/excel/functions/or-function
- https://support.microsoft.com/en-us/excel/functions/not-function
- https://support.microsoft.com/en-us/excel/how-to-correct-a-value-error-in-average-or-sum-functions
- https://support.microsoft.com/en-us/excel/how-to-correct-a-div-0-error

## How each treats its arguments

"Typed" means given directly in the argument list, such as `=SUM(1,TRUE,"2")`. "In a reference" means found in a referenced cell or range.

| Function | Typed logicals and numeric text | Text, logicals, empty cells in a reference         | Error values | Text that isn't a number, typed |
| -------- | ------------------------------- | -------------------------------------------------- | ------------ | ------------------------------- |
| SUM      | Counted                         | Ignored                                            | Cause errors | Causes an error                 |
| AVERAGE  | Disputed, see below             | Ignored. Cells holding 0 are included              | Cause errors | Causes an error                 |
| MIN, MAX | Counted                         | Ignored. Only numbers are used                     | Cause errors | Causes an error                 |
| COUNT    | Counted                         | Not counted                                        | Not counted  | Not counted                     |
| COUNTA   | (not stated)                    | Text and logicals counted. Empty cells not counted | Counted      | (not stated)                    |
| AND, OR  | (not stated)                    | Text and empty cells ignored                       | (not stated) | (not stated)                    |

- SUM or AVERAGE over a range holding #VALUE! returns #VALUE!.
- AVERAGE is disputed. The support page says typed logicals and numeric text "are not counted". The Learn page for the same function says they "are counted". The MIN, MAX and COUNT pages say "are counted". Trust the recorded cases.
- Up to 255 arguments each.

## SUM

- `SUM(number1,[number2],...)`. Each argument is a number (4), a cell (B6) or a range (B2:B8).
- `=A1+B1+C1` gives #VALUE! if a cell holds text. `=SUM(A1:C1)` ignores the text and adds the numbers.

## AVERAGE

- `AVERAGE(number1,[number2],...)`. Returns the arithmetic mean.
- Empty cells are not counted. Cells with zero are.
- Examples with A2:A6 = 10, 7, 9, 27, 2 and B2 = 15, C2 = 32:
  - `=AVERAGE(A2:A6)` is 11.
  - `=AVERAGE(A2:A6,5)` is 10.
  - `=AVERAGE(A2:C2)` is 19.

## MIN and MAX

- `MIN(number1,[number2],...)` returns the smallest number. `MAX(number1,[number2],...)` returns the largest.
- If the arguments contain no numbers, both return 0.
- With A2:A6 = 10, 7, 9, 27, 2: `=MIN(A2:A6)` is 2, `=MIN(A2:A6,0)` is 0, `=MAX(A2:A6)` is 27, `=MAX(A2:A6,30)` is 30.

## COUNT

- `COUNT(value1,[value2],...)` counts numbers only.
- Counted: numbers, dates, and text representations of numbers typed as arguments (such as `"1"`). Logical values typed as arguments are counted too.
- In a reference, only numbers count. Empty cells, logicals, text and errors don't.
- A2:A6 = 12/8/08, 19, 22.24, TRUE, #DIV/0!: `=COUNT(A2:A6)` is 3, and `=COUNT(A2:A6,2)` is 4.

## COUNTA

- `COUNTA(value1,[value2],...)` counts cells that are not empty.
- Counts any kind of information, including error values and empty text (`""`), such as a formula that returns `""`.
- Doesn't count empty cells.
- A2:A6 = 39790, 19, 22.24, TRUE, #DIV/0!: `=COUNTA(A2:A6)` is 5.

## IF

- `IF(logical_test, value_if_true, [value_if_false])`. `value_if_false` is optional.
- Returns `value_if_true` when the test is TRUE, `value_if_false` when it is FALSE.
- Text in a formula needs quotes, as in `"Yes"`. TRUE and FALSE don't.
- A number works as the test. `=IF(A3,A2/A3,0)` takes the false branch when A3 is 0 or empty.
- The page's "Common problems" table: a 0 in the cell means `value_if_true` or `value_if_false` had no argument. #NAME? usually means a misspelling.
- The page doesn't say what IF returns when `value_if_false` is left out and the test is FALSE.
- Functions nest up to 64 levels.

## ROUND

- `ROUND(number, num_digits)`. Both are required.
- `num_digits` > 0 rounds to that many decimal places. 0 rounds to the nearest integer. < 0 rounds to the left of the decimal point.

| Formula             | Result |
| ------------------- | ------ |
| `=ROUND(2.15,1)`    | 2.2    |
| `=ROUND(2.149,1)`   | 2.1    |
| `=ROUND(-1.475,2)`  | -1.48  |
| `=ROUND(21.5,-1)`   | 20     |
| `=ROUND(626.3,-3)`  | 1000   |
| `=ROUND(1.98,-1)`   | 0      |
| `=ROUND(-50.55,-2)` | -100   |

## ABS

- `ABS(number)` returns the number without its sign. It takes one argument.
- `=ABS(2)` and `=ABS(-2)` are 2. With -4 in A2, `=ABS(A2)` is 4.

## AND, OR, NOT

- `AND(logical1,[logical2],...)` is TRUE if all arguments are TRUE, and FALSE if one or more are FALSE.
- `OR(logical1,[logical2],...)` is TRUE if any argument is TRUE, and FALSE if all are FALSE.
- For both: arguments must evaluate to logical values, or be arrays or references that contain them. Text and empty cells in a reference are ignored. If the range contains no logical values, the result is #VALUE!.
- `NOT(logical)` reverses its argument: FALSE gives TRUE, TRUE gives FALSE.
- Example: `=AND(A2>1,A2<100)` is TRUE when A2 is between 1 and 100, exclusive.
