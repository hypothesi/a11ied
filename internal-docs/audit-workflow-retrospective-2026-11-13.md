# Audit workflow retrospective

The current conversational execution pattern is too expensive to be the production
review process. Improve the work units, completion path, and agent interface before
scaling the same loop across more pages. Preserve evidence validation and explicit
criterion judgments.

## Verified observations

The latest admitted snapshot has 598 complete assessments, 887 unresolved and 55
excluded obligations. This continuation began at 585 complete. Product changes and
repeated verification consumed substantial work for 13 additional completions.
These counts describe procedure coverage, not how accessible the site is.

The facade derives every state-by-criterion pair in
`packages/verdict/src/obligations.ts`, while
`packages/verdict/src/admission.ts` rejects site and journey procedures supported
only by state-local evidence. The existing coordinator already distinguishes those
scopes. Until its authentic results are connected, the facade cannot finish this
review. Bead `a11ied-proof-d02` tracks that gap.

Condition capture was necessary: refreshing a root otherwise invalidates valid
judgments. However, adding and debugging it during the audit interrupted assessment.
An overbroad run revision check then rejected a portfolio capture when an unrelated
Services judgment changed the run. The shared revision guard now checks run identity,
the selected state and exclusions. Three concurrency regressions passed after the
build finished. State and exclusion changes still reject captures.

The broader targeted suite passed 63 tests in six files in 94 seconds. A later
24-test run took 187 seconds. Several earlier runs failed or timed out. Running
resource-heavy builds and browser tests concurrently contributed contention; those
logs alone do not establish a precise causal timing breakdown.

The history contains both completed turns and provider failures. An instruction to
continue can prevent discretionary handoffs, but cannot restart a crashed provider.
The skill's application metadata still defaults to a quick component check even
though the skill also describes full-site reviews. Its safety and evidence rules
are clearer than its persistent execution policy.

There is no reliable per-run token billing breakdown in the inspected records.
Avoid invented cost totals or speedup claims. Visible waste includes repeated long
judgment prose, hand-built provenance JSON, large source and status dumps, full-page
images used to inspect tiny regions, and an accidental text dump of image base64.

## Continue without making every obstacle a global stop

Adopt an explicit run-to-completion contract for full-site work:

- Finish the authorized review, not just the next batch or bead. A completed tool
  change, green tests, a draft report or a saved checkpoint does not end the task.
- Record an item-specific blocker and continue independent work. A failed form
  submission authorization or unavailable reader must not stop unrelated visual
  and keyboard assessments.
- Stop the whole run only for user interruption, an unsafe or unauthorized next
  action affecting all remaining work, corruption that prevents trusted recovery,
  or exhaustion of runnable work with every remainder specifically blocked.
- Bound retries. Retry a transient operation once after checking its cause; do not
  repeatedly recollect unchanged evidence or replay submissions. Diagnose repeat
  failures, preserve the attempt, and move other work forward.
- Persist the exact next batch and blockers through the existing run and journal.
  Resume from those records, rather than reconstructing progress from chat.

Prompt changes address voluntary stops. Reliable recovery from provider failures,
context loss and process restarts also needs a durable execution owner outside the
individual model turn. Extend the existing coordinator/host continuation mechanism;
do not add a database or a second scheduler. A heartbeat signals liveness; accepted
coverage or a diagnosed blocker signals progress. Lack of progress requires recovery,
not an endless retry loop.

Technical completion and WCAG conformance must remain separate. An assessment can
finish with confirmed violations. If required observations remain unavailable, deliver
an explicitly incomplete report with precise blockers; do not silently equate that
with completed coverage or conformance.

## Use one authoritative scope and completion model

Finish `a11ied-proof-d02` before expanding the live audit further. Reuse the existing
coordinator for site and journey scope, with a single trusted coverage view and report.
Derive obligation identities from the procedure's actual scope:

- Site checks belong to the assessed site/environment and participating states.
- Journey checks belong to an explicitly observed ordered process.
- State and component checks belong to the actual relevant states or components.

Changing the unit must not manufacture completion. Preserve the old records, disclose
any denominator change, and bind broader judgments to their complete participating
inventory, current snapshots, exclusions and environment. Similar templates do not
justify copying whole-page passes to unobserved pages.

Before another full production run, prove a small end-to-end fixture: two different
pages, an interactive state, a journey, one failure, one absence assessment and a
finished report. Then alter a referenced artifact and verify coverage reopens. This
would have exposed the broader-scope dead end before hundreds of assessments.

## Collect by page and behavior; judge by criterion

Do not drive the browser once for each criterion. Plan a small collection matrix for
each page/state and reuse its actual evidence across relevant procedures:

- Baseline DOM, semantics, media inventory, axe results and visual content.
- A complete keyboard traversal with focus, speech and viewport checkpoints.
- The required text resize, reflow, orientation and spacing conditions.
- Additional real branches: forms, errors, hover content, cancellation and dialogs.
- Site comparisons and complete journeys at their proper scope.

A traversal can support focus visibility, obscuration, keyboard exit and other
judgments. They still need separate conclusions and action coverage. Share observed
facts and captures, not generic outcomes.

Observe every required page and unique state. Reuse a common component assessment
only with an explicit equivalence contract that checks the deployed component,
behavior, configuration and relevant styling. Audit page-specific content and
exceptions independently. Start with recipe reuse and finding deduplication; defer
cross-page verdict reuse until equivalence is demonstrable.

Capture settled states. Use observable layout stability, font readiness, image decode
and control state rather than screenshots taken mid-transition or escalating fixed
sleeps. Scroll through lazy content. An early menu frame in this session looked
clipped; settled evidence showed no persistent loss. Conversely, Services pricing
text really loses letters at 200 percent despite an empty clipping heuristic sample.
Screenshots and criterion judgment remain necessary.

## Parallelize independent work, serialize shared resources

With four available agent slots, start with one coordinator and three workers assigned
disjoint page/state groups. Each worker collects and judges its own assigned work.
Use a separate bounded task for cross-page comparisons and journeys when needed.
Authorization to use agents should be explicit in the full-site skill and invocation.

Workers own isolated browser contexts, leases and artifact directories. Keep their
reports small: accepted check IDs, findings, rejected evidence and blockers. Do not
send the entire conversation or every raw artifact to every worker. Use bounded
browser concurrency and adjust it from measured throughput and memory use.

Serialize journal commits and any shared build output. A native screen reader using
one OS desktop is a single-owner resource; additional native workers need separate
machines or sessions that actually provide isolation. Build once for a verified code
revision, then freeze that output for CLI/MCP tests and audit workers. Do not run
competing builds or saturate the same machine with builds and browser suites.

Run work-conserving scheduling: when one worker is blocked, give it independent work.
Renew leases while progressing; recover expired claims from saved results. Validate
against the affected state and dependencies, not unrelated global progress.

## Spend model tokens on judgment

Move deterministic bookkeeping into the CLI/MCP implementation:

- Generate artifact IDs, paths, hashes, timestamps and provenance in the producer.
  Let the agent cite returned IDs and step ranges with short observations.
- Return small judgment packets: criterion requirements, relevant objects, evidence
  IDs, thumbnails or crops and missing actions. Fetch full sources on demand.
- Return admission errors with the failed field or missing operation and a concrete
  recovery action. Do not make the agent rebuild a large JSON document by hand.
- Emit status deltas and aggregate coverage by default. Full journals, inventories
  and transcripts remain available in files, with paginated or targeted retrieval.
- Keep images binary. Never print base64 as text. Use overview images for layout,
  focused viewport captures for controls, and full-resolution regions when needed.
- Deduplicate repeated finding descriptions in the report while preserving all
  affected locations and independent evidence links.

Cache pinned normative material and the procedure catalog by version. Load it once
per relevant procedure family, then retrieve exceptions or disputed details on demand.
Keep the global skill short and move detailed command schemas into targeted reference
files. Align the application metadata with full-site intent. Separate development and
production-audit recipes clearly, without maintaining duplicate rule sets.

Delegate only batches large enough to justify the startup and context cost. More
agents do not automatically mean fewer tokens. Use deterministic checks for sound
machine decisions, and reserve deeper model review for semantic alternatives, visual
meaning, ambiguous failures, exceptions and conflicting evidence. Do not infer a
whole-criterion pass from axe success or empty heuristic samples.

## Separate product repair from assessment execution

Use a versioned, tested tool revision for an audit batch. When a tool defect appears,
record its affected evidence and obligations, fix the smallest necessary issue, run
focused regressions, and resume from the checkpoint. Continue unaffected work where
safe. Recollect only evidence invalidated by the defect or a changed target.

Run the required standards gate for a coherent code change. Run focused tests during
implementation and the broader relevant suite once at the integration boundary.
Repeat checks when new changes or failures justify them. Tests of tool behavior do
not substitute for auditing the actual site.

Do not create a new abstraction or bead for every awkward observation. Fix the
missing common path, then exercise it end to end. The November 9 performance review
already identified several of these issues; closing implementation beads did not
prove that the complete operational workflow could finish efficiently.

## Acceptance criteria for the revised workflow

Measure a representative pilot before promising a speedup. Record:

- Accepted complete assessments per wall-clock minute and model token consumption.
- Browser navigations and captures per page/condition; evidence rejection and
  recollection rates, with reasons.
- Build, test, collection, judgment, validation and idle time separately.
- Worker utilization, repeated tool calls, context/output volume and review cost.
- Whether a forced interruption resumes without another user prompt, duplicate
  judgments or lost accepted work.

The pilot must finish through the public final-report path, retain all required scope
and evidence, detect the Services resize and collapsed-menu focus defects, reject
altered evidence, and recover an interrupted worker. Record real token usage where
available; otherwise label output sizes and call counts as proxies.

Priorities: connect correct broader-scope completion; establish persistent execution;
batch collection and compact evidence packets; enable isolated parallel workers;
benchmark and tune. Reuse current state files, journals, claims and browser helpers.
