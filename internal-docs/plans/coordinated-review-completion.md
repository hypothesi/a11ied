# Coordinated review completion

This change connects the existing coordinator to the review facade. It does not add a
coordinator, database, trusted-label import or template pass inheritance.

## Package boundary

`review` is the orchestration layer above `core`. It consumes core's existing locked,
validated coordinator snapshots. Browser lifecycle wrappers belong in review; CLI and
MCP import them there. Core does not depend on or reexport review. The state-local
verdict engine and report renderer remain lower-level dependencies.

The scope reader binds the coordinator run ID, origin, WCAG profile, complete active
state set, current fingerprints, root digests/receipts, targets, setup, exclusions and
environments. It returns actual core validation results, never completion inferred
from matching metadata. Nine positive and rejection tests exercise this boundary.

## One judgment for broader procedures

Broader terminal evidence must contain explicit procedure-action coverage. Extend
coordinator evidence records with a typed assessment containing the procedure version,
action indices, outcomes, concise observations and artifact indices. Artifact indices
refer to the record's existing provenance artifacts; their paths, bytes, hashes,
timestamps and scope continue through core's existing validator.

Require complete, nonduplicated action coverage and consistent outcomes for accepted
site/journey terminal results. Reject absent assessments, wrong versions, missing
indices, unsupported artifact indices and contradictory outcomes. Historical broad
records lacking this proof cannot silently become complete. Keep `cantTell` unresolved.

Expose the assessment through the existing record CLI/MCP/API. Do not require a second
review judgment after an accepted coordinator assessment. Do not synthesize assessments
from probe heuristics, setup replay, queued checks or nonempty generic notes.

## Scope-aware coverage

When explicitly linked, derive state-local obligations from the current state verdict
engine and broader obligations from core's actual procedure catalog and coordinator
checks. Site units belong to an environment and its participating states; journey
units belong to the observed ordered journey. Missing required journey context remains
an unresolved unit, never an empty list that makes coverage disappear.

Compute broader completion from current core-verified records and check validation,
including complete action coverage and scope issues. Never trust a stored verified
label or a caller-authored completion object. Revalidate on status, next and report.
Keep the existing state-local admission rejection of site/journey claims.

The first explicit linkage changes the coverage denominator to the proper units.
Disclose that change and preserve all previous state/criterion records. Do not copy a
site judgment onto every state or call the lower count newly performed work.

## Existing public workflow

Add an explicit coordinator link to start/resume. Resume preserves roots, records and
leases and rejects incompatible scope overrides. Validate the linked run ID and full
root bindings. Current reviews can attach a newly prepared coordinator using their
actual collected roots; no root receipt is fabricated or upgraded.

Review next handles state work normally and returns a machine-readable next action
for broader work through the existing coordinator. Core next supports a scope filter
so site/journey work can be claimed without consuming unrelated queued state checks.
That filter is not an obligation exclusion or a completion shortcut.

## Reports and trusted composition

Compose the state report with current validated broader results in the higher-level
review layer, which can call core's real evidence verifier. Do not duplicate core's
validator in verdict/report, introduce arbitrary verifier callbacks, or expose a
mark-accepted bypass. Pure report formatting helpers may be shared; the public final
report path must perform the actual source validation.

Show broader units and their actual scope separately from per-page findings. Do not
label every covered state as a violation location for a site-level failure. Include
coordinator identity, participating roots, relevant checks, evidence references and a
snapshot digest. Unfinished unrelated state checks in the linked coordinator do not
replace or duplicate current review state assessments.

Use a consistent lock order for run and coordinator consumption. Hold the validated
coordinator view through final report construction where required; unrelated progress
must not stale a state-local capture, while changed participating scope must reopen
broader results.

## Verification

Exercise current compatible scope, altered roots/receipts, wrong run/target/environment,
changed exclusions, missing participant states, stale/tampered artifacts, incomplete
actions, changed journey order and evidence contradictions. Prove a small final report
through public CLI/MCP/API, then tamper its proof and verify that finalization refuses.
Run builds before CLI tests and freeze their output. The live audit remains incomplete
until its own observations and all required scope are actually assessed.
