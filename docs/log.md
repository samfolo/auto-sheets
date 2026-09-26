# Build log

Moments where the thinking shifted: tensions, wrong assumptions and ideas worth keeping for the write-up. The decisions themselves live in [decisions.md](decisions.md).

## 2026-09-26

**Descoping is the wrong lever when you're building a factory.** Claude first recommended a minimum harness, with undo and most functions pushed to "extensions". That's how you protect a one-day budget when you write the clone by hand. Sam rejected it: undo is one more case (send Ctrl+Z, record what Excel does), and the number of functions is something the factory produces, not something we plan. What survived is a limit on verification, not generation. The factory can only claim what it has checked against Excel, so the rate at which we can observe Excel is the real bottleneck.

**The model never writes an expected value.** Sam's proposal for exploration: the model invents scenarios, the harness runs them in Excel through Playwright, and what Excel does becomes the fixture. This removes a whole class of failure, where a model writes a plausible but wrong expectation and then "fixes" the clone to match it. The model decides what to try; Excel decides what's correct.

**Models are poor random generators.** Claude's refinement of the random-walk idea: asked to explore randomly, a model keeps returning to the same few favourite cases. The proposed split is to have the model write targeted scenarios that test a hypothesis, such as "does SUM skip text inside a range but convert text passed directly?". A seeded generator then produces volume from the formula grammar, biased toward realistic sheets: a small area, references that land on filled cells, and a mix of types. Fresh seeds after implementation double as a held-out set. The model never saw those cases, so its pass rate on them estimates how well the clone generalizes.

**Prompt the disposition, enforce the trigger.** Sam's idea: the system prompt should tell the agent to question the architecture and restructure when that makes things simpler. It should also recognize thrashing, because a fix that isn't easy often means the design is wrong. Claude's refinement: an instruction alone won't reliably fire at the right moment, because a model deep in a fix loop doesn't notice it's looping. The verify script can detect a stall mechanically: the same case failing across several attempts, a flat pass count, or a fix that breaks other cases. It then prints an instruction to stop, write a diagnosis and consider reverting to the last passing commit. Git checkpoints make backtracking a real action rather than an intention. (Proposed, not built.)

**Constrain the boundaries, not the internals.** Sam's instinct is a tokenizer → lexer → parser → evaluator pipeline, but Sam chose not to prescribe it. It's the natural shape, it's well represented in training data, and prescribing it only helps if it's right. What we do fix are the contracts at the edges, the things the harness depends on: the case format, the clone's API, and how adapters find cells.

**Structure for observability versus structure as a ceiling.** Sam wants a readable case format, to be able to inspect cases and add new ones, but worries that a schema we impose could be worse than one the model would design. The current position is to own the envelope that the harness and reports depend on (identity, provenance, typed expectations) and not to fix the step vocabulary up front. Every time the model runs into the schema's limits is evidence for changing it.

**Offline docs as resilience.** Sam's framing: giving the agent web search makes the factory depend on Microsoft's site staying up, in the same way a rate limit stops a crawl midway. Pull the docs in while we have access. A second benefit is that every source the agent cites is pinned, so it can't mistake Google Sheets or LibreOffice documentation for Excel's.

**Check tool claims before designing around them.** Claude advised against Glide, claiming its canvas rendering would force coordinate-based tests. Inspecting the package took two minutes and showed that was wrong: Glide renders a hidden accessible table with test IDs for the visible cells. A cheap check overturned a design recommendation.

**Honest autonomy.** Sam won't give the harness Microsoft credentials. The harness launches its own browser profile and a person signs in once, so the accurate claim is "autonomous after one human sign-in".

**You can't write the scenario before you've seen the system.** Sam noticed that a scenario can't be written up front, because what you can sensibly do next depends on what the page shows now. So you act, look, then decide. This has a name: characterization testing (Michael Feathers' term). You record what an existing system does instead of asserting what it should do. With a closed-source reference, the recording is the specification.

**Specify requirements, not implementation.** Sam noticed the pre-work design sketched the evaluator's calculation algorithm, and took the existence of that sketch as evidence that the model can plan its own implementation. So the factory's job moves from designing the clone to specifying behaviour and observing the result. Claude added one qualification: code organisation still matters, but only as a means. Tangled code costs the agent context and makes its edits less reliable.

**A library policy instead of a library choice.** Rather than telling the agent to use Immer for undo, the spec says well-tested libraries are allowed and lets the undo requirement pull one in. If the agent picks something else, that choice is itself information.

**The harness is developed by running it.** Sam's method: build what we know from our assumptions, let the factory build the clone from scratch, then study the run. What went right, what went wrong, where it got stuck, which tool would have unblocked it, and what contracts it produced. Change the factory and run again.

**You can't learn from runs you can't attribute.** Sam's concern: if the factory itself isn't versioned, a run's outcome can't be tied to the factory state that produced it, so we can't tell whether a change helped. Claude suggested recording this automatically for every run rather than relying on a manual version bump.

**Two kinds of observability.** Sam asked whether the evaluator should log its calculations, and where traces should go. Claude's framing: telemetry about the factory (what the agent did and where it struggled) is needed from the first run. Debugging aids inside the clone, such as evaluation traces, get added when a run shows the agent needed them. This follows Sam's rule of building what we know now and adding tools at the first real obstacle.

**The proof can't be rerun by the reviewers.** The golden-path suite's Excel half needs a signed-in Microsoft session, which reviewers won't have. The recorded Excel run (report, traces, factory version) has to be checked in as evidence, and the write-up should say so.

**"From scratch" has to mean from scratch.** Sam's requirement: clones must not be able to see each other, and the factory must not remember past clones. Otherwise a later run can borrow from an earlier clone and look better than the factory really is. It's the same leak as training on the test set. Claude proposed the dividing line: facts about Excel may flow back into the factory, but clone code may not. Without a sandbox, isolation comes from how runs are set up (a fresh directory and an explicit list of inputs), plus a check afterwards for any access outside the run's directory. (Proposed.)

**The domain chose the data format.** Sam questioned why we had both YAML and JSON. Checking YAML against spreadsheet input settled it. YAML silently retypes the very inputs whose treatment by Excel we're testing: `001`, `1.0`, `TRUE`, and `#N/A`, which YAML reads as a comment. JSON makes every typed value an explicit string, and using one format also removed the need for an index file.

**Purpose over metadata.** Sam's rule: everything that exists must have a purpose. Applying it removed the integrity hash, the schema version fields and the index. The hash's job, stopping the agent from editing expected values, moves to where verification runs. The launcher checks the clone against the factory's original `reference.json` files, not the build's copies, so the rule is enforced by the design rather than by a field.

**A test account changed the autonomy claim.** A dedicated Microsoft account removed the reason for keeping credentials out of the harness. It also removed the privacy problems with videos and workbook metadata. The harness can now sign itself back in.

**Check current docs rather than model memory.** Sam asked for library knowledge to come from current documentation, not what the model remembers. Reading it before writing code changed two things. Zod's new "compiled" schemas (`z.compile()`, in 4.5) turned out to be an optional speed-up for heavily used validation, so not needed here. TypeScript 7 now defaults `types` to an empty list, which would have broken every Node import with a confusing error. The same discipline the factory applies to Excel applies to its own dependencies.

**Determinism versus volatile functions.** The brief requires a deterministic, resettable clone, but `RAND` and `NOW` are nondeterministic in Excel. The clone therefore needs a seeded random number generator and an injectable clock, and those functions can only be checked against Excel through properties, such as "`RAND` is in [0, 1) and changes on every recalculation", not through exact values.
