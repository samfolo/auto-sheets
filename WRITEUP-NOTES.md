# Write-up notes

I wanted to share some other details that didn't fit in the main [`WRITEUP.md`](WRITEUP.md); there was a 2-3 page restriction, so I moved the extra details here.

## The other candidates

My mind naturally went to two familiar places: LeetCode (the coding platform) and Logic Pro/Premiere Pro.

- Logic Pro was quite interesting; I had always wanted to do a timeline editor. There are likely several open-source libraries that could help, but the problem statement said closed-source software only, so I was hesitant.
- LeetCode stood out because code is incredibly verifiable. I'm very glad I didn't choose this one; I would have burned the day and made less progress.

## A target that changes underneath you

When you're scripting interactions with a system served as SaaS or something with continuous deployment, the DOM selectors cannot be trusted to remain stable. Either reference elements by role, or find a way to identify the exact snapshot or the exact build you're scripting for. We captured the selectors, roles, and names we would script against in a dedicated file (`targets/excel/driver/excel.ts`).

## Identity

Another concern I had was login credentials; I considered the risk involved with giving my personal email and Microsoft account to the agent. I decided I was not comfortable with that, so instead I created a new Proton email: sam.test.harness@proton.me. If you need to replicate other systems, having identity, having warmed-up accounts, or having verified credentials you're not afraid of sharing with inference providers is a necessity.

## Observability

The factory needs to be able to observe itself and what it's building, but so do we; I decided to rely on pino, a well-known logging library for the tracing I didn't get for free as part of the Pi coding harness. After laying foundations, Opus 5.5 would sometimes add more instrumentation as part of drive-by fixes. I asked it to say, in one or two sentences, what it understood about the permission it was given to add its own observability:

```
I was told how the factory reports rather than what to report: every command receives a Trace, events go through the one telemetry module into the run's events.jsonl, and nothing that could hold a secret is ever logged. So whenever something happened that someone would want to know about afterwards (a retry, a repeated click, a restored checkpoint), I gave it a named event with its details, without waiting to be asked.
```

## Bootstrapping each build

I wanted to focus on the logic of the thin, focused slice and remove any issues that would come from leaving an agent to decide the tech stack, entry points, and workspace scaffolding; I found it necessary to automatically bootstrap new workspaces at the start of runs. I also wanted to give it offline access to Microsoft's public documentation to remove the need for a web search tool entirely.

I wanted to make sure the project skeleton was reliable and predictable. Agents didn't know about any other runs or what was in any of the other directories, but I wanted to remove slight differences in project setup from the equation. If you're making changes that, in a stable environment, would lead to better results, but due to variance in project setup, you start to get unpredictable results, it becomes harder and harder to trust the decisions that you're making.

## Two `try_steps` episodes

Two examples come from a run where `check_cases` reported a failed test, and DeepSeek suspected the checker; it ran `try_steps` with three steps:

```json
[{ "do": "click-column", "column": "K" }, { "do": "click-row", "row": 5 }, { "do": "click-corner" }]
```

The model questioned the harness rather than second-guessing its own implementation, and turned out to be right.

A second instance was when Kimi K3 was driving a run: the app wasn't opening. It called `try_steps` three times, but I didn't design the tool correctly; Kimi couldn't really investigate the error based on the context that I gave it through the tool, so it went looking for an instance of Playwright outside of the sanctioned area. It found an install for Playwright somewhere else in my home directory and used that to spin up its own Chrome instance, observe the 404 for itself, and fix the problem in about 5 minutes. The next check reached 20 out of 37; this is more corroborating evidence for how important sandboxes are (`docs/evidence/2026-09-26-an-error-that-named-nothing/`).

## Schema design, for a larger target

Some of the schema, some of the artefacts, and manifest schemas are generic enough to be shared across products, whereas some things are Excel-specific. I would spend more time thinking about schema design to make sure bootstrapping a new factory to handle a different product isn't a matter of having to reinvent the wheel or leave behind hard-won lessons from efforts like this one.

Disclaimer: this write-up was produced primarily with Wispr Flow, followed by line-level edits for structure and clarity. Snippets were generated by Claude.
