# Operators and precedence

Sources:

- https://support.microsoft.com/en-us/excel/calculation-operators-and-precedence-in-excel (applies to Excel for the web)
- https://support.microsoft.com/en-us/excel/detect-formula-errors-in-excel
- https://support.microsoft.com/en-us/excel/how-to-avoid-broken-formulas-in-excel
- https://support.microsoft.com/en-us/excel/how-to-correct-a-value-error
- https://support.microsoft.com/en-us/excel/multiply-by-a-percentage-in-excel

## Formulas

- A formula starts with `=`. After it come operands separated by operators.
- Excel calculates left to right, following the precedence table below.
- Without the `=`, nothing is calculated. Typing `SUM(A1:A10)` shows that text. Typing `11/2` in a General cell shows the date 2-Nov.
- Text constants in a formula need double quotes. Missing quotes can give #NAME?.

## Arithmetic operators

| Operator | Meaning                   | Example       |
| -------- | ------------------------- | ------------- |
| `+`      | Addition                  | `=3+3`        |
| `-`      | Subtraction, and negation | `=3-1`, `=-1` |
| `*`      | Multiplication            | `=3*3`        |
| `/`      | Division                  | `=3/3`        |
| `%`      | Percent                   | `=20%`        |
| `^`      | Exponentiation            | `=2^3`        |

- Arithmetic produces numeric results.
- 1 is 100%. `=1-15%` subtracts 15 percent from 1.
- Only `*` multiplies. With constants, typing `x` makes desktop Excel offer to replace it with `*`. With cell references, `x` gives #NAME?.

## Comparison operators

- `=`, `>`, `<`, `>=`, `<=`, `<>` (equal, greater, less, greater or equal, less or equal, not equal).
- The result is always a logical value: TRUE or FALSE. Example: `=A1=B1`.

## Text concatenation operator

- `&` "connects, or concatenates, two values to produce one continuous text value".
- `="North"&"wind"` gives `Northwind`.

## Reference operators

| Operator | Name         | Meaning                                                          | Example               |
| -------- | ------------ | ---------------------------------------------------------------- | --------------------- |
| `:`      | Range        | One reference to all cells between two references, both included | `=SUM(B5:B15)`        |
| `,`      | Union        | Combines several references into one                             | `=SUM(B5:B15,D5:D15)` |
| space    | Intersection | Reference to the cells the two references share                  | `=SUM(B7:D7 C6:C8)`   |

- The page also lists `#` (spilled range, `=SUM(A2#)`) and `@` (implicit intersection, `=@A1:A10`).
- A space between ranges that don't intersect gives #NULL!. So does `=SUM(A1 A5)` where `A1:A5` was meant.
- The comma also separates function arguments. Some locales use `;` instead.
- Don't type formatted numbers such as `$1,000` in a formula. `$` marks an absolute reference and `,` separates arguments. Type `1000`.

## Precedence

Highest first. Operators on the same row are evaluated left to right (for example `*` and `/`).

| Order | Operator                   | Description                 |
| ----- | -------------------------- | --------------------------- |
| 1     | `:` (space) `,`            | Reference operators         |
| 2     | `-`                        | Negation (as in `-1`)       |
| 3     | `%`                        | Percent                     |
| 4     | `^`                        | Exponentiation              |
| 5     | `*` `/`                    | Multiplication and division |
| 6     | `+` `-`                    | Addition and subtraction    |
| 7     | `&`                        | Concatenation               |
| 8     | `=` `<` `>` `<=` `>=` `<>` | Comparison                  |

These follow from the table. Check them against the recorded cases:

- Negation comes before `^`, so `=-2^2` means `(-2)^2`.
- `&` comes after `+`, so `="A"&1+2` joins "A" with 3.
- Comparison comes last, so `=1+1=2` compares 2 with 2.

## Parentheses

- The part in parentheses is calculated first.
- `=5+2*3` is 11: multiplication first.
- `=(5+2)*3` is 21: the addition in parentheses first.
- `=(B4+25)/SUM(D5:F5)` adds first, then divides by the sum.

## How values are converted in formulas

Each operator expects a kind of value. If it gets another kind, Excel may convert it.

| Formula                  | Result  | Why                                                                               |
| ------------------------ | ------- | --------------------------------------------------------------------------------- |
| `="1"+"2"`               | 3       | `+` expects numbers, so the text "1" and "2" become numbers                       |
| `=1+"$4.00"`             | 5       | Text in a format usually accepted for a number is converted                       |
| `="6/1/2001"-"5/1/2001"` | 31      | The text is read as mm/dd/yyyy dates, turned into serial numbers, then subtracted |
| `=SQRT("8+1")`           | #VALUE! | "8+1" can't be converted. `"9"` or `"8"+"1"` would work and give 3                |
| `="A"&TRUE`              | ATRUE   | Where text is expected, numbers and TRUE/FALSE become text                        |

- The page gives no example of a logical value in arithmetic (such as `TRUE+1`).
- Operators such as `+` and `*` may fail on cells that hold text or spaces, giving #VALUE!. Functions often skip text instead: use `=SUM(A2:C2)` rather than `=A2+B2+C2`, and `=PRODUCT(A2,B2)` rather than `=A2*B2`.
