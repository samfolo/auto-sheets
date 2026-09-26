# Sheet replica

A replica of Excel for the web's cells and formulas. `npm install` then `npm start` serves the
screen and its API at `http://localhost:4321` (or the port in `PORT`). All workbook state is in
memory; restarting returns a blank workbook.

## API

- `GET /api/health` — `{ "ok": true }` once the app is ready.
- `GET /api/state` — the whole screen state: every non-empty cell's `raw`, `display` and
  `annotations`, the selection (`areas`, `active`, `range`), the Name Box value, the readout
  and a `version` that changes on an outside reset.
- `POST /api/reset` — replaces the workbook with a blank one and clears the undo history. A
  JSON body `{ "seed": "<base64 .xlsx>" }` is accepted but seeding is not implemented yet; the
  sheet is left blank.
- `POST /api/action` — runs one action and returns the new state. The body carries a `type`:

  | type             | fields                 | meaning                                        |
  | ---------------- | ---------------------- | ---------------------------------------------- |
  | `select`         | `address`              | select a cell or range typed in the Name Box   |
  | `commit`         | `text`, `ctrl`, `move` | type into the active cell, or all (Ctrl+Enter) |
  | `clear`          |                        | Delete over the selection                      |
  | `fill-down`      |                        | Ctrl+D                                         |
  | `copy` / `paste` |                        | Ctrl+C / Ctrl+V                                |
  | `undo` / `redo`  |                        | Ctrl+Z / Ctrl+Y                                |
  | `click`          | `cell`, `hold`         | mouse click on a cell                          |
  | `click-column`   | `column`, `hold`       | click a column header                          |
  | `click-row`      | `row`, `hold`          | click a row header                             |
  | `click-corner`   |                        | click the select-all corner                    |
  | `select-all`     |                        | Ctrl+A                                         |
  | `drag`           | `from`, `to`, `hold`   | drag between cells or headers                  |
  | `press`          | `key`, `hold`          | a movement key                                 |

`hold` is a list of `"Shift"` and `"Command"`.

## Layout

- `src/engine/` — the rules and state, with no UI or HTTP: addresses, entry parsing, the
  formula parser/evaluator, references, the sheet, selection, history and the session.
- `src/server/` — the HTTP API over the session, and the Vite-middleware dev server.
- `src/client/` — the React screen: the grid, the controls and the keyboard handling.
