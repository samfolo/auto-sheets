# An error that named nothing

Kimi K3's build of the submitted clone (run `2026-09-26T21-09-30-433Z-4023`), an hour in and before its first checkpoint. Its server had stopped serving its own page: `/` returned 404, so the sheet never rendered. The full check at 22:01 UTC took nine minutes and came back 0 of 37, every case failing the same way:

```
Could not open a blank sheet.
locator.waitFor: Timeout 15000ms exceeded.
```

The agent called `try_steps` three times, from 22:11 to 22:13, to see what the checker saw, and got the same two lines each time. Its reasoning (in `transcript-excerpt.jsonl`, from the run's Pi session) guesses at which element the checker waited for, whether it had to be visible, and whether Vite was serving the page. The message said neither which element (the Name Box) nor that the page itself had failed to load.

So the agent went around the harness. It looked for Playwright on the machine, found an install in another project in the user's home folder, drove its own browser with it, saw `HTTP 404 http://localhost:…/`, and fixed the server at 22:16. Its next check reached 20 of 37, and it went on to 37 of 37.

Two lessons:

- The factory's own error failed the standard the factory sets for errors: say what went wrong, where, and what to do about it. The checker waits for the Name Box (`targets/excel/clone/target.ts`, reported from `src/sheet/driver.ts`); naming it, and whether the page loaded at all, would have answered the agent's question from the checker alone.
- The sandbox let a builder read outside its workspace. It denies reading the factory and the other builds and allows everything else (`src/kernel/sandbox.ts`), so the agent could use another project's files. It couldn't write there or signal other processes (its `kill` and `ps` were refused), but reads should be denied by default.

Paths to the user's home folder and the other project are redacted in the excerpt.
