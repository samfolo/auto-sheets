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

I wanted to build an agent that treated the problem as a black box exercise. Claude pointed me to some methodology for black box testing or testing based on constraints and behaviour [1]. It served as the foundation for the approach we ultimately took. To start with, we used pre-existing general-purpose CLIs, specifically Playwright, to click around and log actions we took and their side effects on the perceived state of the application. This is the view of the world we have to work with; we use the application as a real user might, and generate something to serve as the guardrails or scaffolding for an agent to course-correct and verify it's doing the right thing.

When you're scripting interactions with a system served as SaaS or something with continuous deployment, I've learned the DOM selectors cannot be trusted to remain stable. Either reference elements by role, or find a way to identify the exact snapshot or the exact build you're scripting for. For the purposes of this, we didn't do that. We instead captured the selectors, roles, and names we would script against in a dedicated file (`targets/excel/driver/excel.ts`).

Another concern I had was login credentials; I considered the risk involved with giving my personal email and Microsoft account to the agent. I decided I was not comfortable with that, so instead I created a new Proton email: sam.test.harness@proton.me. If you need to replicate other systems, having identity, having warmed-up accounts, or having verified credentials you're not afraid of sharing with inference providers is a necessity.

## How AI was used

I was already aware of Pi as the framework behind a lot of successful and sophisticated agent projects. I used the SDK directly (`7166ac5`), which let me integrate Pi idiomatically. The SDK-exposed primitives allowed us to instrument agent tools and introduce makeshift sandboxing to prevent it from doing things we didn't want it to do or taking harmful actions.

When writing the system prompt for the Pi agent, I wanted to make sure the instructions were generic. They needed to focus on how to engage with the problem, as opposed to imperative instructions on how to implement the replica itself. I had experience writing lexers, parsers, and evaluators and resisted the temptation to prescribe that approach, but a large majority of the runs decided on structuring things that way anyway.

Error quality, I believe, has an outsized impact on the success and effectiveness of a system like this. The models are trained to understand natural language, so any opportunity you can use to communicate the problem in natural language should be taken. Often, it's a matter of describing what went wrong, whose fault it was, and how to remedy the situation, in the same way that you might in human-facing UI [2]. A combination of having a read tool, a write tool, and a bash tool alone means the model is almost certainly able to remedy the situation. The only real lever we have is giving it the context it needs to act.

How can we observe the system, and how can the model observe the system? The factory needs to be able to observe itself and what it's building, but so do we; I decided to rely on pino, a well-known logging library for the tracing I didn't get for free as part of the Pi coding harness. I explained the importance of observability to Opus 5.5, and once it understood it was a priority, it would add more instrumentation as part of drive-by fixes. I asked Opus 5.5 to say, in one or two sentences, what it understood about the permission it was given to add its own observability:

```
I was told how the factory reports rather than what to report: every command receives a Trace, events go through the one telemetry module into the run's events.jsonl, and nothing that could hold a secret is ever logged. So whenever something happened that someone would want to know about afterwards (a retry, a repeated click, a restored checkpoint), I gave it a named event with its details, without waiting to be asked.
```

I wanted the decisions as well as the append-only log to be first-class assets in the repo, which is why we have `docs/log.md` and `docs/decisions.md`. Their contents are machine-authored, less documentation, more field notes.

Once things were stable enough that I felt confident to run multiple builds at the same time, I started to see that they were actually affecting each other. So at that point, we needed to wrap the tool handlers in some considerations that isolated them from each other basically, which was the sandboxing part of this. We had first class evidence of the need for sandboxing (`docs/evidence/2026-09-26-parallel-interference/`). The only sandboxing that I added was basic enough to avoid killing siblings.

I wanted to focus on the logic of the thin, focused slice. I wanted to remove any issues that would come from leaving an agent to decide the tech stack and decide entry points, and workspace scaffolding. I found it necessary to automatically bootstrap new workspaces at the start of runs. I also wanted to give it offline access to Microsoft's public documentation. It would have made a call to their doc site anyway, but I wanted to remove the need for a web search tool entirely. I found it necessary to give the agent its own context library.

I wanted to make sure that the project skeleton itself was reliable and predictable. Agents didn't know about any other runs. They didn't know what was in any of the other directories, but I wanted to remove slight differences in project setup from the equation. I think there's something to be said when it comes to standardising the environment so that you can isolate where the changes that you are making are having any impact on the quality of the build. If you're making changes that, in a stable environment, would lead to better results, but due to variance in project setup, you start to get unpredictable results, it becomes harder and harder to trust the decisions that you're making.

Alongside the standard tools Pi has access to, like the read, write, and bash tools, I also added two custom ones. `check_cases` is a way to run the tests themselves; if this beats the previous best score, then the harness commits a new checkpoint. If not, then the changes are left as they were. `try_steps` is a way to check whether the current implementation gives you a certain output. It's like an on-the-fly test case where you can see, given these steps, what the output is.

Two examples come from a run where `check_cases` reported a failed test, and DeepSeek suspected the checker; it ran `try_steps` with three steps:

```json
[{ "do": "click-column", "column": "K" }, { "do": "click-row", "row": 5 }, { "do": "click-corner" }]
```

This was an interesting situation where the model questioned the harness rather than second-guessing its own implementation and turned out to be right and was able to prove it.

A second instance was when Kimi K3 was driving a run. The app wasn't opening. It called `try_steps` three times. This was an interesting workaround Kimi went for. I didn't design the tool correctly. Kimi couldn't really investigate the error based on the context that I gave it through the tool, so it went looking for an instance of Playwright outside of the sanctioned area. It found an install for Playwright somewhere else in my home directory and used that to spin up its own Chrome instance and observe the 404 for itself. It was able to use that to fix the problem in about 5 minutes. The next check reached 20 out of 37. I guess this is more corroborating evidence for how important sandboxes are (`docs/evidence/2026-09-26-an-error-that-named-nothing/`).

## Verification

In my experience, a model wielding Playwright moves very slowly. I needed to make sure that we could iterate and verify as quickly as possible, and that we could do so in a repeatable fashion. One of the things that I was doing when I was initially designing was thinking about a schema for defining a set of steps that I would like the agent to take, in order that can be translated into Playwright scripts. I built similar things in the past for setting up end-to-end data for end-to-end tests for front-end applications where you need to fill in particular forms and navigate the UI to get to a particular state before you can make any assertions. This was reminiscent of that, but I needed it to be machine-checkable, and I needed it to be simple enough that an agent can come up with new states, arbitrary states, on its own. Every action that is taken and its output, based on what we were listening for (for instance, the current value in particular cells, or the current value of the name box, or the current value of the formula bar), was recorded.

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

Things that were very easily verifiable, like the formula evaluation, passed pretty well. There was very little resistance there. There were very few cases where the formula evaluation was not built correctly, and I think we can attribute that to the availability of a very rigorous specification. The one thing I would say that would be a little bit of a shortcut is the fact that almost certainly a lot of the algorithms necessary to implement formula evaluation for Excel and Google Sheets are in the training data for frontier models. I don't even know whether they would have worked it out from first principles or not, but either way, the main point is they didn't look at the closed-source implementation.

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

I'm going to flag it as something that I would change: modelling functional UI behaviour, like making sure that the row headers are always visible, as something that we track. That's an invariant that we should have been tracking, and I underprioritized it to avoid encoding aesthetic opinions.

It's difficult to predict what the model is going to see as an obvious consideration and what it's going to miss entirely because it wasn't part of what was being tracked and it wasn't necessary to pass the test. I wouldn't go so far as to call it reward hacking. I would call it a gap in the scoring rubric. The only thing that I would consider closest to reward hacking is the behaviour with clicking and dragging to select the ranges. The idea that you only apply the selected range when the mouse-up event is fired tells me that the DeepSeek and Space Bunny models didn't see any need to faithfully implement Excel. Even though they must be aware of Excel as a product and must be aware of the idea of dragging cells and the selected range updating in real time as the cursor moves, it wasn't part of the scoring criteria, so they felt no real reason to implement behaviour to do that. The way that we kind of overcame that was by increasing the fidelity of what we're tracking, increasing the fidelity of the assertions, and tracking the state of the board as the cursor moves, not necessarily just when the pointer is raised. You would need to intentionally choose which signals you pay attention to and build tooling to observe those signals, and then this just becomes a trade-off between what's worth tracking and what isn't.

The idea of checkpointing was that if you run verification at any stage and it passes more cases than the last time, the system automatically commits, and therefore you always have access to the best version of the application, the one that passes the most cases. If you introduce a regression, it doesn't commit, and if you end up breaking the application, you always have access to the best version. The clone that was submitted as part of this submission is not the final state, which was actually a broken state. This was the best version of the application as of this run.

## Next

With 2 more days, I would have spent a little more time planning and building the tooling with even more care.

### With two more days

- Look into the shape that things need to take so that the builds themselves were properly sandboxed. I'd be wary of the implementing agent working outside of the sanctioned area and causing actual damage. The incident that I caught was minor, but it's indicative of what the actual risk is.
- Spend more time thinking about how best to capture computed styles, computed values, and states and things. The browser itself manages a lot of this state.
- Spend more time on the fuzzing infrastructure. Particularly, I have an idea for running the original implementation and the clone side by side with the same random actions, and sorting all of the differences into:
  - tasks that need to be built
  - rules that need to be canonised
  - noise that is safe to ignore
- Add more control around runs. Can I resume or otherwise supervise a run to avoid outages and killed processes? Burning longer-running builds costs money in most cases and also costs a lot of time.
- Spawn the application in different viewport sizes, zoom levels, etc., to try and tease out some of the responsive behaviour. The replica assumes 100% zoom level and a full screen.

### Scaling to a much larger target

The things that already scale: the target is just a folder. It has the driver, its cases, knowledge documents, docs, and a spec.md. If you want to capture more of the product, you just add new cases and explore on different axes. However, at the moment, a new product means defining a new driver. Builds are able to run in parallel already. Coverage is already generated, not listed, so those things scale.

At the moment, there is a single agent responsible for the entire implementation, and whilst that has its benefits, there is no way that one agent's work can clutter another agent's work. We don't have to worry about git merge conflicts. We also only move as fast as a single model can handle. I suspect that there is a shape of the system where a single model might be responsible for managing and orchestrating multiple agents to get the work done quicker. Each can be frontloaded with its own set of file system permissions and specialised tools.

Some of the schema, some of the artefacts, and manifest schemas are generic enough to be shared across products or use cases, whereas some things are Excel-specific. I would definitely spend more time thinking about schema design to make sure that bootstrapping a new factory to handle a different product isn't a matter of having to reinvent the wheel or leave behind hard-won lessons from efforts like this one.

The checks themselves don't scale currently because a full check runs every test. I'll probably start to think about how I can segment those checks so that different concerns or different properties of the system have their own sub-suites and can be run independently.

I would solve the identity problem as well. AgentMail comes to mind. I would have more intentional management of credentials.

I've thought about what it might take to convert this into something more general-purpose able to take any accessible piece of closed-source software and devise its own strategy to replicate it. I've come away from this exercise with a newfound respect for the scope of that problem. It's an incredibly interesting and ambitious project, and one that I'll likely be thinking about for some time.

## Citations

1. Michael Feathers, [Characterization Testing](https://michaelfeathers.silvrback.com/characterization-testing) (2016); the term is from his _Working Effectively with Legacy Code_ (2004). Surfaced by Claude; see `docs/log.md` line 25.
2. Nielsen Norman Group, [Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) (2023).
3. Ecma International, [ECMA-376: Office Open XML File Formats](https://ecma-international.org/publications-and-standards/standards/ecma-376/), and Microsoft's [[MS-OI29500]: Office Implementation Information for ISO/IEC 29500 Standards Support](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/1fd4a662-8623-49c0-82f0-18fa91b413b8), where Office varies from the standard.
