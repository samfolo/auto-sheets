# Decisions

Landed decisions for this build, one line each with the reason. A replaced decision is marked superseded, not deleted. Questions stay at the bottom until they land.

## The plan in brief

The factory is a directory of contracts, tools and reference knowledge that a Pi agent works inside. The agent explores Excel for the web by writing scenarios: sequences of declarative steps that a deterministic tool plays through Playwright, snapshotting the sheet after each step. Excel's snapshots become the expected results; the model never writes them. The agent then builds a clone, an in-memory backend loaded from the same `.xlsx` workbooks plus a grid UI, and runs the same scenarios against it through a second driver. A comparator reports each mismatch with a precise code and location, and the agent repairs the clone until the scenarios pass. Every tool call lands in the run's JSONL log, stamped with the factory version, so we can study where the agent struggled and improve the factory between runs. The final proof is a golden-path suite that passes identically against Excel and the clone.

## Decisions

1. **Target: Microsoft Excel for the web.** It runs in a browser that Playwright can drive, and it gives one reproducible reference environment.
2. **Slice: cell entry and formula calculation, including dependent recalculation and undo/redo.** This is where Excel's logic lives: parsing, type coercion, error propagation, dependency order and edit history.
3. **Workflow: seed the sheet → edit → inspect dependent results → introduce an error → confirm it → correct it → reset.**
4. **We build the factory; the factory builds the clone.** Our code is the case schema, the adapters for Excel and the clone, the runners, the comparator, the knowledge corpus and the agent instructions. The factory's agent generates the evaluator, API and UI.
5. **Breadth is not descoped up front.** The factory covers as much of the formula language as it can verify. Only behaviour confirmed against Excel is claimed as faithful; everything else is reported as unverified.
6. **The harness never holds Microsoft credentials.** It launches its own browser profile, a person signs in once, and the harness reuses that session. Reference access is autonomous only after that step.
7. **Reference cases are checked in, including the `.xlsx` files Excel produced.** Any observation can be re-checked from the repository.
8. **Documentation is a static local corpus, not live web search.** Runs don't depend on Microsoft's site being reachable, and every cited source is pinned. Sources include Microsoft's Excel support pages, ECMA-376 (the published spreadsheet file format standard, which includes a formula grammar) and Microsoft's notes on where Excel departs from that standard. Documentation is a hypothesis: observed Excel behaviour wins when they disagree.
9. **TypeScript throughout.**
10. **Commits are single-line conventional commits.**
11. **Every artifact the harness consumes has a Zod schema in a contracts directory and is validated before use.** A JSON Schema is exported from each one for editor support. The model receives validation errors in Zod's human-readable format, so it can fix its own output precisely.
12. **Expected values always come from Excel.** The model writes scenarios; the harness runs them in Excel and records what happens as the expectations.
13. **The clone's internal architecture is not prescribed.** Only the contracts at its boundaries are fixed.
14. **Agent runtime: Pi with a Playwright extension.** A spike confirmed it can drive the browser.
15. **The harness drives Excel with Playwright only.** The agent writes scenarios once it knows Excel's selectors. Computer use is off the table unless Playwright hits a wall.
16. **Journeys are built incrementally.** Take a few steps, snapshot the state, choose the next steps from what's visible, and repeat. The finished journey becomes a fixture.
17. **Random scenarios come from a seeded generator.** Volatile functions are left out of generated scenarios for now.
18. **Volatile functions, when added, are tested with property-based tests at the evaluator level.**
19. **We specify requirements, not implementation.** The clone is judged as a black box by its inputs, outputs and side effects. Performance budgets can be requirements. Well-organised code is a preference, not a criterion.
20. **The clone loads `.xlsx` workbooks into memory and never writes back to them.** Edits live in memory and reset reloads the workbook. Export is optional.
21. **Scenarios are declarative, and a driver for each target turns them into Playwright actions deterministically.** The same scenario runs on Excel and on the clone.
22. **A golden-path suite runs identically against Excel and the clone.** Only setup and teardown differ. Passing on both is the main evidence of fidelity.
23. **Well-tested external libraries are allowed but not prescribed.** The spec states the behaviour needed, such as undo, not which library provides it.
24. **The agent works through deterministic tools.** Tools are Node scripts that import documents and workbooks, run scenarios, validate and compare. The agent doesn't bring files in by hand.
25. **Every run produces a JSONL log** of each tool call, its inputs, its result and its duration, so a run can be analysed afterwards, including by a model. Pino is the likely logger.
26. **Errors use central codes with English messages and exact locations** (file, line, field, step, cell). "Something went wrong" is never an acceptable error.
27. **Files we author are YAML.** The workbook library and the documentation corpus each have an index that tools maintain. Every manifest is dated and records the schema and factory versions that produced it.
28. **The factory is versioned, so every run can be matched to the factory state that produced it.**
29. **Reference documents are not front-loaded.** The agent is told where they are and searches them with grep; there are no embeddings. The corpus also includes the Glide documentation, pulled in selectively.
30. **A launcher points the factory at a directory and builds the clone from scratch, repeatedly.** A `doctor` command first checks Playwright, Pi, the Excel session and the configuration.
31. **No formal verification (Lean) in this submission.**
32. **Every clone build starts clean.** No clone can see another clone, and the factory carries nothing from past clones into a new build.
33. **Each recorded Excel observation keeps a video of the run that produced it, one-to-one.** Replacing an observation deletes its video. This is provenance for reviewers, not test input.

## Open questions

- **What Excel exposes to Playwright.** Which controls and cell states can be read from the page (address box, formula bar, cell text, alignment, dialogs) decides the snapshot contents and whether one script can drive both targets unchanged.
- **Excel setup and reset.** Proposed: upload a fresh copy of the seed workbook for each scenario and delete it afterwards.
- **Where clones and run outputs live.** Proposed: each build runs in a new directory outside this repository, with its own Git history, and only the factory's declared inputs are copied in. Facts about Excel can flow back into the factory; clone code never does. The clone chosen for submission is copied into this repository at the end.
- **Case layout.** Proposed: one directory per case, holding the steps, the seed workbook, what Excel did and the evidence. The golden path is a label on cases, not a separate kind of file.
- **Evidence privacy.** Videos of the signed-in Excel session may show account details, and Playwright traces can contain session cookies. Decide what gets checked in.
- **How versions are recorded.** Proposed: every run records the factory's version number, Git commit and whether there were uncommitted changes, automatically. The version number is bumped when a contract changes.
- **Index format.** JSON for querying with `jq`, or YAML like other authored files. Proposed: people and models write YAML, and tools write JSON.
- **Observation integrity.** Proposed: observations are written only by tools and carry a hash of their evidence, so an edited expectation fails validation.
- **Stall detection.** Proposed: the verify script detects repeated failures and tells the agent to stop and reassess.
- **Grid.** Glide Data Grid is the likely choice. It exposes an accessible table, but its peer dependencies cap React at 18.
- **Reference capture of typed values.** Whether to read typed values from a downloaded `.xlsx` as well as from the page. A spike will settle this.
