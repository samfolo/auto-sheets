# Entering data

Sources:

- https://support.microsoft.com/en-us/excel/enter-data-manually-in-worksheet-cells
- https://support.microsoft.com/en-us/excel/get-started/available-number-formats-in-excel (has a Web tab)
- https://support.microsoft.com/en-us/excel/reset-a-number-to-the-general-format
- https://support.microsoft.com/en-us/excel/display-numbers-in-scientific-exponential-notation
- https://support.microsoft.com/en-us/excel/keeping-leading-zeros-and-large-numbers
- https://support.microsoft.com/en-us/excel/set-automatic-data-conversions
- https://support.microsoft.com/en-us/excel/stop-automatically-changing-numbers-to-dates
- https://support.microsoft.com/en-us/excel/format-numbers-as-text
- https://support.microsoft.com/en-us/excel/format-numbers-as-percentages-in-excel
- https://support.microsoft.com/en-us/excel/multiply-by-a-percentage-in-excel
- https://support.microsoft.com/en-us/excel/change-the-way-negative-numbers-are-displayed
- https://support.microsoft.com/en-us/excel/date-systems-in-excel
- https://support.microsoft.com/en-us/excel/detect-formula-errors-in-excel
- https://support.microsoft.com/en-us/excel/how-to-avoid-broken-formulas-in-excel
- https://support.microsoft.com/en-us/excel/how-to-correct-a-value-error
- https://support.microsoft.com/en-us/excel/functions/count-function
- https://support.microsoft.com/en-us/excel/excel-specifications-and-limits

## What a typed entry becomes

These are the defaults. Desktop Excel (Microsoft 365 and 2024) lets you turn some of them off under Automatic Data Conversions. That page says the conversions happen during "data entry or typing".

| You type                   | Result                                                                    |
| -------------------------- | ------------------------------------------------------------------------- |
| `00123`                    | The number 123. Leading zeros are removed                                 |
| `0784367998`               | 784367998                                                                 |
| 16 or more digits          | A number. Digits after the 15th become 0                                  |
| `12345678901234567890`     | Stored as 12345678901234500000, shown as 1.23457E+19                      |
| `1e9`                      | A number shown as 1.00E+09                                                |
| `123E5`                    | A number shown as 1.23E+07                                                |
| `12/2`                     | A date, shown as 2-Dec                                                    |
| `11/2`                     | A date, shown as 2-Nov in a General cell (not 11 divided by 2)            |
| `9/5/2002` or `5-Sep-2002` | A date. Separate the parts with `/` or `-`                                |
| `9:00 p`                   | 9:00 PM. Without `a` or `p` after a space, the time is AM                 |
| `JAN1`                     | The date January 1                                                        |
| `0 1/2`                    | The fraction 1/2. The 0 isn't kept, and the cell gets the Fraction format |
| `'00123`, `'1e9`, `'1/47`  | Text. The apostrophe isn't displayed                                      |
| A space, then a number     | Text. The space stays in the cell                                         |
| `SUM(A1:A10)` (no `=`)     | Text. Nothing is calculated                                               |

- Excel keeps 15 significant digits.
- The limits page lists the largest allowed number as 9.99999999999999E+307 (1.7976931348623158e+308 via a formula) and the smallest positive number as 2.2251E-308. Negatives mirror these.
- A cell holds up to 32,767 characters.
- Alt+Enter starts a new line inside the cell.

## Dates and times

- A date is stored as a serial number: the days since January 1, 1900 (the default 1900 date system). July 5, 2011 is 40729.
- The earliest date for calculation is January 1, 1900. The latest is December 31, 9999.
- A typed date or time shows in the default date or time format, or in the format the cell had before you typed.
- A date aligned right in its cell is a date. A date aligned left is text.

## Text

- Numbers stored as text are aligned left. Numbers are aligned right.
- In a cell formatted as Text, what you type is kept exactly as typed, even numbers. A formula typed there, such as `=2+3`, shows as `=2+3` and isn't calculated.
- Changing a cell to Text doesn't convert numbers already in it. Re-enter them (F2, then Enter).
- A number stored as text may get a small green triangle in the cell's upper-left corner.

## Percentages

- The Percentage format multiplies the cell value by 100 and shows it with `%`.
- A cell with 10 in it shows 1000.00% after you apply Percentage.
- In a cell already formatted as Percentage, typing 10 or 0.1 both give 10.00%.
- The pages treat typing `15%` in a cell as the same value as `0.15`. In a formula, `%` is the percent operator (`=20%`).

## Negative numbers and booleans

- Showing negatives in parentheses is a display choice of the Number and Currency formats. The pages don't say how a typed `(100)` is read.
- The COUNT and COUNTA examples put TRUE in a cell. COUNT skips it as a logical value, and COUNTA counts it. No page describes typing TRUE or FALSE into a cell.

## How the General format displays numbers

- General is the default format Excel applies when you type a number. Mostly, numbers show as typed.
- If the cell is too narrow, General rounds numbers that have decimals. Web example: 25.76 shows as 26.
- General uses scientific notation for numbers of 12 or more digits. The desktop and web pages both say this.
- Scientific notation: `E+n` means "times 10 to the nth power". A 2-decimal Scientific format shows 12345678901 as 1.23E+10. Two decimals is the default.
- A format changes only the display. The formula bar shows the stored value, and calculations use it, not the rounded display.
- `#####` appears when a number or date is too wide for the column in its format.

## Entering into several cells

- Enter or Tab confirms the entry (see `keyboard-and-editing.md`).
- Desktop: select several cells (they need not be adjacent), type in the active cell, and press Ctrl+Enter. The same entry goes into every selected cell.
