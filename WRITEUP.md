# Write-up

I was tasked with one of the most interesting assignments I've come across in recent memory: the design and implementation of a system able to take a piece of closed-source software and replicate a thin, focused slice as faithfully as possible with minimal manual intervention. After reading the brief, I saw they only wanted a single day's worth of effort; I knew this would have an impact on my ambition, but I found the constraint itself allowed me to come up with creative workarounds.

## Defining the problem

On the 25th of September, I gave myself a day to think about the problem. I thought about the constraints mentioned in the brief, especially the part where it said it was more important to have a faithful replication than a fully featured, less accurate implementation. I was thinking I should choose something simpler in nature, where the functionality is recognisable and the product itself is focused on a core set of affordances. Intuitively, I also wanted to lean toward something easy to verify, which immediately disqualified a number of applications. For instance, something like Photoshop, where it's harder to verify it's been replicated faithfully.

Having a background in music production as well as software engineering, my mind naturally went to two places: LeetCode, the coding platform, and Logic Pro/Premiere Pro.

- Logic Pro was quite interesting; I had always wanted to do a timeline editor. There are likely several open-source libraries to faithfully replicate certain pieces of functionality that might have been difficult to implement from scratch. The problem statement said closed-source software specifically, so I was hesitant to do that.
- LeetCode stood out because code is incredibly verifiable. In retrospect, I'm very glad I didn't choose this one; I would have burned the day and made less progress.

Ultimately, I decided to take on Microsoft Excel; tried, tested, well-specified, and definitely closed-source. Excel was the most verifiable and predictable product I could think of that was complex enough to demonstrate my ability to build a system that could replicate non-trivial software. The XLSX file format, the ECMA formal specification, and Microsoft's deviations were all documented and could be referenced directly [3].

I wanted to focus primarily on cell values and formula calculation. As part of the presentation of the project, I wanted to also implement basic cell interactions like highlighting columns, rows, individual cells, etc. I don't spend a lot of time in Excel, so I was caught by surprise as to how complex the highlighting and selection logic turned out to be.

## Approaches and trade-offs

I took time up front to get myself in the right headspace. I wasn't building an agent that needed to know everything there is to know about building specific types of software. I needed to build an agent able to look at an arbitrary piece of software and reverse engineer it to replicate it faithfully.

My initial instinct was to come up with the system prompt I could pass to a Pi agent that explained exactly how it might implement Excel. I quickly caught a number of issues with that approach:

- A lot of my initial assumptions may be wrong.
- Even a factory successfully built around that set of assumptions would fail to meet the expectation.

Another instinct I had was to reach for CUA (computer-use agent), which I had on my system already. I realised I was choosing tooling before knowing what I was going to build. Building something completely generic able to look at any piece of software, decide its own methodology, come up with its own references, and successfully use those to reverse engineer by interfacing with the UI alone is a much bigger, more ambitious project. I truly do believe it's possible, but it was not what was asked.

What I ended up building was far more opinionated about the app being replicated. To successfully replicate a product, having some understanding of where that software sits in the world, what its job is, who its target users are, and some kind of documentation or spec will likely go a long way. The trade-off is that a lot of the work that goes into building that factory may not be easy to repurpose in some other context.

I wanted to build an agent that treated the problem as a black box exercise and was able to navigate something easily and record its findings. Claude pointed me to some methodology for black box testing or testing based on constraints and behaviour [1]. It served as the foundation for the approach we ultimately took. To start with, we used pre-existing general-purpose CLIs, specifically Playwright, to click around and log actions we took and their side effects on the perceived state of the application. This is the view of the world we have to work with; we use the application as a real user might, and generate something to serve as the guardrails or scaffolding for an agent to course-correct and verify it's doing the right thing.

When you're scripting interactions with a system served as SaaS or something with continuous deployment, I've learned the DOM selectors cannot be trusted to remain stable. You should assume they will change underneath you and design appropriately. Either reference elements by role, or find a way to identify the exact snapshot or the exact build you're scripting for. For the purposes of this, we didn't do that. We instead captured the selectors, roles, and names we would script against in a dedicated file (`targets/excel/driver/excel.ts`).

Another concern I had was login credentials; I considered the risk involved with giving my personal email and Microsoft account to the agent in service of this task. I decided I was not comfortable with that, so instead I created a new Proton email: sam.test.harness@proton.me. If you need to replicate other systems, having identity, having warmed-up accounts, or having verified credentials you're not afraid of sharing with inference providers (or sending over the wire in any way) is a necessity.

## How AI was used

I was already aware of Pi as the framework behind a lot of successful and sophisticated agent projects. I used the SDK directly (`7166ac5`), which let me integrate Pi idiomatically. The SDK-exposed primitives allowed us to instrument agent tools and introduce makeshift sandboxing to prevent it from doing things we didn't want it to do or taking harmful actions.

When writing the system prompt for the Pi agent, I wanted to make sure the instructions were generic. They needed to focus on how to engage with the problem, as opposed to imperative instructions on how to implement the replica itself. I had experience writing lexers, parsers, and evaluators and resisted the temptation to prescribe that approach, but a large majority of the runs decided on structuring things that way anyway.

Error quality, I believe, has an outsized impact on the success and effectiveness of a system like this. The models are trained to understand natural language, so any opportunity you can use to communicate the problem in natural language should be taken. Often, it's a matter of describing what went wrong, whose fault it was, and how to remedy the situation, in the same way that you might in human-facing UI [2]. A combination of having a read tool, a write tool, and a bash tool alone means the model is almost certainly able to remedy the situation. The only real lever we have is giving it the context it needs to act.

How can we observe the system, and how can the model observe the system? The factory needs to be able to observe itself and what it's building, but so do we; I decided to rely on pino, a well-known logging library for the tracing I didn't get for free as part of the Pi coding harness. I explained the importance of observability to Opus 5.5, and once it understood it was a priority, it would add more instrumentation as part of drive-by fixes over the course of development.

```
I was told how the factory reports rather than what to report: every command receives a Trace, events go through the one telemetry module into the run's events.jsonl, and nothing that could hold a secret is ever logged. So whenever something happened that someone would want to know about afterwards (a retry, a repeated click, a restored checkpoint), I gave it a named event with its details, without waiting to be asked.
```

I wanted the decisions as well as the append-only log to be first-class assets in the repo, which is why we have `docs/log.md` and `docs/decisions.md`. Their contents are machine-authored, less documentation, more field notes.

Once things were stable enough that I felt confident to run multiple builds at the same time, I started to see they were actually affecting each other. We had first class evidence of the need for sandboxing (`docs/evidence/2026-09-26-parallel-interference/`). The only sandboxing I added was basic enough to avoid killing siblings.

I wanted to focus on the logic of the thin, focused slice; I wanted to remove any issues that would come from leaving an agent to decide the tech stack, entry points, and workspace scaffolding. I found it necessary to automatically bootstrap new workspaces at the start of runs. Every build started in a new folder outside of the factory, holding the spec and every case the Pi agent was allowed to see, except for held-out cases. I also wanted to give it offline access to Microsoft's public documentation. I wanted to remove the need for a web search tool entirely. I found it necessary to give the agent its own context library.

I wanted to make sure the project skeleton was reliable and predictable. I wanted to remove slight differences in project setup from the equation. If you're making changes that, in a stable environment, would lead to better results, but due to variance in project setup, you start to get unpredictable results, it becomes harder and harder to trust the decisions you're making.

Alongside the standard tools Pi has access to, like the read, write, and bash tools, I also added two custom ones:

- `check_cases` allowed Pi to start a fresh copy of the app on a dedicated port and run all the recorded cases through the screen (exactly as they were recorded against the live site). It then gets access to the score, what the last change fixed or broke, and every difference between the live site and the current implementation. If this beats the previous best score, the harness commits a checkpoint, as described below.
- `try_steps` let the model try novel cases on the replica under construction.

Two examples:

- A run where `check_cases` reported a failed test, and DeepSeek suspected the checker; it ran `try_steps` with three steps: click column K, click row 5, click the corner. The app answered exactly right each time. This was an interesting situation where the model questioned the harness rather than second-guessing its own implementation.
- A second instance was when Kimi K3 was driving a run. The app wasn't opening. It called `try_steps` three times and got the same two lines each time (`Could not open a blank sheet.` and `locator.waitFor: Timeout 15000ms exceeded.`). This was an interesting workaround Kimi went for where it went around the harness: Kimi was able to find a Playwright install in another project, in my home folder, drive its own browser, see the 404, and fix it in about 5 minutes. The next check reached 20 out of 37. This is more corroborating evidence for how important sandboxes are (`docs/evidence/2026-09-26-an-error-that-named-nothing/`).

## Verification

In my experience, a model wielding Playwright moves very slowly. That pace wasn't going to work for me. I needed to make sure that we could iterate and verify as quickly as possible, and that we could do so in a repeatable fashion. I thought through a schema for defining a set of steps I want an agent to take, in order and in a way that can be translated into Playwright scripts. I needed it to be machine-checkable and simple enough that an agent can come up with new states or new arbitrary sequences on its own. Every action taken and its output, based on what we were listening for (for instance, the current value in particular cells, the name box, or the formula bar), was recorded.

```json
{ "do": "drag", "from": "B2", "to": "C3" },
{ "do": "click", "cell": "E5", "hold": ["Command"] },
{ "do": "drag", "from": "G2", "to": "H4", "hold": ["Command"] },
{ "do": "click-column", "column": "K", "hold": ["Command"] },
{ "do": "observe-selection" }
```

```json
{ "active": "K1", "areas": ["B2:C3", "E5", "G2:H4", "K:K"] }
```

```
targets/excel/
  driver/     Excel's selectors, roles and names; sign-in; opening and uploading workbooks
  cases/      each case's steps, and Excel's recorded answer
  knowledge/  what we learned about Excel, dated, and marked observed or documented
  docs/       notes from Microsoft's documentation
  clone/      the spec a clone is built to
```

We were able to script actions against the live site and record their side effects. That meant we never needed to anticipate or predict those side effects. For every reference we decided to accept, we ran the experiment twice and made sure the logged output was identical both times. It's a flawed mechanism because you could coincidentally get the same thing if randomness returns the same result twice; because we expect Excel to be, on the whole, predictable and deterministic (one of the reasons we chose it), I decided two runs alone would suffice.

I observed some of the earlier iterations and realised some of the behaviour wasn't even being captured. It showed me the importance of manual testing, though I held it in tension with the idea of a general-purpose replication factory/agent. After a back-and-forth with Opus, we landed on an exploration suite: a utility that could generate random valid actions. We were able to provide a seed, so we could produce the exact same set of actions. The way we added variance was to evolve the suite to influence:

- the probability of particular actions being spawned, e.g. modifier keys being held at the same time (holding Shift and clicking, or holding Command and dragging);
- which keys, rows, and columns were even in play.

Random actions teased out unexpected states, which improved coverage.

I remember the moment I saw how complex selection behaviour in Excel actually was, the moment I accidentally discovered you could declare overlapping ranges. When doing light research into the specification, I saw mention of an algorithm to algebraically decide which groups of cells are highlighted and belong to which highlighted ranges.

Fortunately, because of the approach we were taking, I didn't have to manually work out how that worked; the model built an engine that satisfied the contract, and that expression inadvertently covered all the overlapping range complexity as a side effect, which was very satisfying to see.

Things that were very easily verifiable, like the formula evaluation, passed well. There were very few cases where the formula evaluator was built incorrectly; we can attribute that to the availability of a very rigorous spec. A lot of the algorithms necessary to implement formula evaluation for Excel and Google Sheets faithfully are likely already in the training data for frontier models; the main point is we didn't look at the closed-source implementation.

| Build (factory 0.2.0)                          | Cases passed, of 48 | Held out, of 2 | Cost   | Time    |
| ---------------------------------------------- | ------------------- | -------------- | ------ | ------- |
| Kimi K3, best checkpoint (the submitted clone) | 42                  | 1              | $5.84  | 108 min |
| Kimi K3, final run                             | 40                  | 1              | $10.08 | 41 min  |
| DeepSeek v4.1 Flash                            | 39                  | 1              | $0.22  | 50 min  |
| Space Bunny Alpha                              | 21                  | 0              | $0.00  | 75 min  |

The 48 cases were each recorded on Excel twice and kept only when both recordings agreed: 31 written by hand and 17 explored. Across every build attempt, inference cost about $19.

The gaps were primarily in interactivity. For instance, in the submitted version:

- Selecting a cell that already has a value obscures the underlying value. Looking into the code, it was because an opaque white highlight gets drawn over the cell (`clone/src/client/theme.css:162`).
- The horizontal scrolling didn't catch that the border should be sticky.

Modelling functional UI behaviour is an invariant that I should have been tracking more carefully; I underprioritized it to avoid encoding aesthetic opinions. One more Kimi K3 run used the final spec, which asked for headers that stay in view, and the final test infrastructure, but it only scored 40 out of 48 (after breaking the app again), and so didn't make the cut for the final submission.

It's difficult to predict what the model is going to see as an obvious consideration and what it's going to miss entirely because it wasn't part of what was being tracked and it wasn't necessary to pass the test. I wouldn't go so far as to call it reward hacking. I would call it a gap in the scoring rubric. The only thing I would consider closest to reward hacking is the behaviour with clicking and dragging to select the ranges. The idea that you only apply the selected range when the mouse-up event is fired tells me the DeepSeek and Space Bunny models didn't see any need to faithfully implement Excel. The way we overcame that was by increasing the fidelity of what we're tracking and tracking the state of the board as the cursor moves. You would need to intentionally choose which signals you pay attention to and build tooling to observe those signals, and then this becomes a trade-off between what's worth tracking and what isn't.

The idea behind checkpointing: if it passes more cases than the last time you ran verification, outstanding changes are automatically committed. If the suite detects a regression, or if the application is broken in any way, the commit is skipped, so we always have access to the best version produced in that run. During one of the runs with Kimi K3, we hit the time limit whilst trying to fix a lint sweep that broke the page. The clone submitted as part of this submission is therefore not the final state reached for that run.

## Next

With 2 more days, I would have spent a little more time planning and building the tooling with even more care.

### With two more days

- **Sandboxing.** I would look into the shape that things need to take so that the builds themselves were properly sandboxed. The incident that I caught was minor, but it's indicative of what the actual risk is. It shows that sometimes the system might behave in ways that you can't predict and are not prepared to handle.
- **Rendering and state.** I would spend more time thinking about how best to capture computed styles, computed values, and states.
- **Fuzzing.** I have an idea for running the original implementation and the clone side by side with the same random actions, and sorting all of the differences into tasks that need to be built, rules that need to be canonised, and noise that is safe to ignore.
- **Control around runs.** Can I resume or otherwise supervise a run to avoid outages and killed processes? Some of our builds went as long as 108 minutes; others were affected by low credit on an API key or a killed process.
- **Viewports.** I would spawn the application in different viewport sizes, zoom levels, etc., to tease out the responsive behaviour. The replica assumes 100% zoom level and a full screen.

### Scaling to a much larger target

To scale this thing properly, you would have to plan a lot more. The things that already scale: the target is just a folder. It has the driver, its cases, knowledge, docs, and a spec. If you want to capture more of the product, you just add new cases and explore on different axes. Builds are able to run in parallel already, and coverage is already generated, not listed. However, a new product means defining a new driver.

- **Parallel agents.** At the moment, there is a single agent responsible for the entire implementation. Whilst that has its benefits (we don't have to worry about git merge conflicts or time-of-check, time-of-use issues), we also only move as fast as a single model can handle. I suspect that there is a shape of the system where a single model might be responsible for orchestrating multiple agents, each frontloaded with its own set of file system permissions and specialised tools, so each agent could do one job well and quickly.
- **Schema design.** Some of the schemas are generic enough to be shared across products, whereas some things are Excel-specific. I would spend more time thinking about schema design, to make sure that bootstrapping a new factory to handle a different product isn't a matter of having to reinvent the wheel or leave behind hard-won lessons from efforts like this one.
- **Checks.** The checks themselves don't scale, because a full check runs every test. I would segment those checks so that different properties of the system have their own sub-suites and can be run independently, which would help with iteration time.
- **Drift.** Selectors would either have to be versioned, or I would need a stronger definition for what is being replicated.
- **Identity.** AgentMail comes to mind. I would want to understand exactly how identity is provided to implementing agents that need access to the live site at any stage, and have more intentional management of credentials.

I've thought about what it might take to convert this into something more general-purpose able to take any accessible piece of closed-source software and devise its own strategy to replicate it. I've come away from this exercise with a newfound respect for the scope of that problem. It's an incredibly interesting and ambitious project, and one that I'll likely be thinking about for some time.

## Citations

1. Michael Feathers, [Characterization Testing](https://michaelfeathers.silvrback.com/characterization-testing) (2016); the term is from his _Working Effectively with Legacy Code_ (2004). Surfaced by Claude; see `docs/log.md` line 25.
2. Nielsen Norman Group, [Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) (2023).
3. Ecma International, [ECMA-376: Office Open XML File Formats](https://ecma-international.org/publications-and-standards/standards/ecma-376/), and Microsoft's [[MS-OI29500]: Office Implementation Information for ISO/IEC 29500 Standards Support](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/1fd4a662-8623-49c0-82f0-18fa91b413b8), where Office varies from the standard.
