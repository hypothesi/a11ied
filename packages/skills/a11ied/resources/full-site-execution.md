# Full-site execution policy

Own the entire authorized review. A completed batch, bead, build, capture or draft
report is a checkpoint, not a reason to end the task. Continue independent work until
the review is complete or no authorized runnable work remains.

## Start and resume

Read the existing run and its current coverage before collecting anything. Recover
saved work and expired claims; do not rebuild history from conversation or restart
the audit. Preserve exclusions, action authorization and reader provenance.

Before expanding collection, verify that every required procedure scope has a path
to accepted evidence and final reporting. A site or journey assessment cannot be
replaced with a single-state capture. A missing completion path is a tool defect to
repair, not permission to infer passes or silently change the coverage denominator.

Use the existing run, journal and issue tracker for durable progress. Save the next
runnable batch, accepted results, rejected attempts and item-specific blockers.
A provider crash cannot be recovered by prompt wording alone: the host must resume
the same durable run. Do not claim automatic host recovery unless it was exercised.

## Keep working through local blockers

Record missing permission, credentials, hardware or evidence against the affected
assessment, then claim independent work. Do not stop the whole review for one blocked
form, page or reader. Do not repeat blocked submissions or invent substitutes.

For a transient failure, inspect the cause and retry once when safe. If it repeats,
preserve the attempt and diagnose or block that operation. Do not loop unchanged
captures, relax admission, or repeatedly ask for already-granted permission.

Stop only for user interruption, an unsafe or unauthorized next action affecting all
remaining work, corruption that prevents trusted recovery, or exhaustion of runnable
work with specific blockers for every remainder. Report incomplete coverage honestly.
Confirmed violations do not themselves prevent completion of an assessment.

## Collect efficiently and judge explicitly

Group work by page/state and behavior: baseline inventory, keyboard traversal,
required layout conditions, and additional real interaction branches. Reuse those
actual observations across relevant procedures, with separate criterion judgments.
Every required page and unique state still needs observation; template similarity is
not a whole-page pass. Use scope-correct site comparisons and ordered journeys.

Wait for meaningful state and layout stability, font readiness and image loading.
Inspect settled screenshots and exceptions. Empty heuristic samples do not establish
absence. Distinguish a transient animation frame from persistent content loss.

Cite producer-returned evidence IDs, paths and action ranges. Keep judgments specific
and short; do not repeat entire procedures or reconstruct provenance by hand. Fetch
full transcripts, source material and inventories only when needed. Keep images
binary; never print base64 image data into text output. Cache pinned references by
version, and request targeted sections for disputed requirements or exceptions.

## Parallel work

When the user authorizes parallel agents, use one coordinator and a bounded worker
pool assigned disjoint page/state groups. Each worker owns an isolated browser
context, lease and artifact directory. Give it the scope, authorization, procedure
versions, evidence locations and expected result contract, not the whole conversation.

A worker returns accepted check IDs, findings, rejected evidence and blockers, plus
the exact next runnable work if interrupted. The coordinator validates coverage,
reassigns blocked workers to independent work and handles site/journey comparisons.
Renew progressing claims and recover expired claims without duplicating judgments.

Serialize shared journal commits, shared build output and one native screen reader
controlling a desktop. Additional native workers require actual machine/session
isolation. Freeze tested build output during audit and CLI/MCP validation. Avoid
resource-heavy builds competing with browser tests. Increase concurrency only when
measured throughput improves without evidence rejection or resource exhaustion.

## Verify completion and cost

Use required focused regressions after tool repairs, then required integration gates
at a coherent boundary. Recollect only affected evidence. Green tool tests do not
establish site conformance. Preserve confirmed findings, assessment completeness and
conformance as separate results.

Track accepted assessments, elapsed time, navigations, rejection/recollection reasons,
worker utilization and tokens when available. Label call counts or output sizes as
proxies rather than invented token billing. Do not promise a speedup without a pilot.
A final report requires complete required scope and current admitted evidence; a draft
or a checkpoint must never be presented as completion.

## Condition captures and coordinated completion

`--capture` saves an immutable condition artifact tied to the current root fingerprint
and digest, without refreshing that root. Conditions are `default`, `text200`,
`reflow320`, and `textSpacing`; actions use the existing declarative setup format.
Do not combine capture with refresh, setup, slice or target overrides. The producer
verifies the current baseline tree, blocks submissions and navigation away from the
state, and preserves failed attempts. Use returned capture paths with the root
fingerprint and digest in explicit procedure assessments. Supported JSON sections are
`observation`, `actionTrace` and `transcript`; recorded PNG paths are also supported.
Resize, reflow and spacing passes require verified condition observations, actual
interactions and screenshots. A capture does not assign a verdict or establish native
screen-reader behavior.

Use `review resume` with the current review ID, existing coordinator file and its run
ID to attach broader scope without recollecting roots or replacing leases. Register
each coordinator state's `observationDigest` from its actual collected root. That
digest binds typed setup, exclusions and evidence bytes; the coordinator's textual
setup instructions are not an observation receipt. Evidence state references repeat
the same digest, and changed digests reopen affected work.

Follow `coordinatorNextAction` through `audit_assessment` when site or journey work
remains. `audit next --scope site,journey` selects those units without excluding state
obligations. Broader terminal records require an explicit current assessment for every
procedure action, with actual provenance artifact indices. Accepted results need no
second review judgment. Linked reports disclose the change from state-by-criterion
counts to the actual state, site and journey units; missing journey context stays
unresolved. Reported participants are not automatically violation locations.

## Host continuation contract

Resume an interrupted worker with:

```bash
a1 review resume --run-dir <dir> --run-id <sameId> --agent <sameWorkerId> --json
```

Coordinator options are needed only to attach or change
an explicit link. Resume preserves accepted judgments and root receipts, retains live
claims, and removes expired leases. Accepted judgments renew remaining claims and save
`lastProgressAt`; repeatedly reading status does not count as assessment progress.

`review status` returns `execution.state` and a typed `nextAction`. Follow runnable
state work through `review.next`, broader work through `audit_assessment`, and missing
journey context through `collect-scope`. Collect actual authorized process evidence
before registering that scope. A missing journey is not an empty successful audit.
Local blockers remain listed while independent work stays runnable.

`waiting` preserves another worker's live lease or the coordinator's active claim.
Use the lease expiry as a recovery boundary; inspect coordinator claims before
explicitly recovering an interrupted coordinator. Do not steal active work. `blocked`
means no currently unleased assessment can run; diagnose its recorded scope and
capability reasons and continue any authorized repair or evidence collection.
`complete` uses the same readiness policy as final reporting, including scope gaps.
A completed batch, an entirely excluded scope or an incomplete draft is insufficient.

The host owns provider restart: after a crash, start a new process with that same
resume command, inspect durable progress, then continue. Cold CLI/MCP tests exercise
saved-work recovery across process boundaries. They do not establish automatic
provider relaunch. Never replay submissions or other external effects from chat history.
