# Building the clone

You are building the app described in `SPEC.md`: a clone of how Excel for the web handles cells and formulas. Read `SPEC.md` first, then the recorded cases in `cases/` and the notes in `knowledge/`.

## What's here

- `SPEC.md`: what the app must do, and the four screen controls the checker drives.
- `cases/<area>/<claim>/case.json`: what a person did in Excel, step by step.
- `cases/<area>/<claim>/reference.json`: what Excel showed at each `observe` step. This is the ground truth.
- `knowledge/`: what was learned about Excel while recording, including awkward behaviour.
- `./factory`: the factory's command-line tool. `./factory --help` lists its commands.

`cases/` and `knowledge/` are read-only copies. The checker uses the factory's originals, so changing them changes nothing.

## Checking your work

1. Start the app in the background: `npm start > app.log 2>&1 &`
2. Run the checker: `./factory --json case verify --url http://localhost:4321`
3. Read each difference. It names the case, the step and the cell, then what Excel showed and what your app showed.
4. To run a single case, add its id: `./factory --json case verify errors/division-by-zero-spreads-to-dependants --url http://localhost:4321`
5. Stop the app before starting it again: `kill %1`, or find its process with `lsof -i :4321`.

## Rules

- TypeScript. All workbook state in memory; nothing written to disk while the app runs.
- The calculation lives on the server, behind the API. The screen renders what the API returns.
- Commit after each change that makes more cases pass: `git add -A && git commit -m "feat: …"`, one line, conventional-commit style.
- Never make a case pass by recognising its particular inputs. Implement the general rule the references show; unseen cases will test the same rules.
- If the same case still fails after two fixes, stop editing. Write down in `NOTES.md` why the design resists the fix, and consider changing the design.
- Before you finish, write `NOTES.md`: what you built and why, which cases pass, which don't, and what you would try next.
