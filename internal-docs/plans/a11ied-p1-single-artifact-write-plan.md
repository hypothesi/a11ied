# Single artifact write: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P1-12.

## Summary

Remove the write-register-then-rewrite sequence in `probe-run.ts` that doubles I/O and screenshots for every check. Artifacts are written once, registered once, and recorded once.

## Objectives and scope

In scope:

- `runClaim` in `probe-run.ts`: single `writeProbeArtifacts` call per check.
- Registration order: record paths on the state before or during the single write, never after.
- Interaction with lightweight evidence (P1-8 manifest): single write emits the manifest.

Out of scope:

- Changing artifact content shapes (P1-8 owns that).
- The `updateAuditRun` file-lock protocol.

## Assumptions

- `registerAuditState` appending artifact paths does not need the artifact bytes to exist yet (it stores paths only); recording validation (P1-8 manifest) can check bytes after the write.
- The first write's bytes are final; no content depends on the registration step.

## Requirements

### Functional

- FR-1: `runClaim` calls `writeProbeArtifacts` exactly once per check.
- FR-2: Artifact paths are registered on states before `recordEvidence` (single `executeAuditAssessment` state update per check, not per artifact batch twice).
- FR-3: No second screenshot is captured for the same check.

### Non-functional

- NFR-1: Artifact writes per check drop from 2 to 1; assert with a counting test.
- NFR-2: No change to validated evidence content.

## Design

- Reorder `runClaim`: build artifact inputs → write once → one batched `state` update registering all paths → reload run → `recordEvidence` → `evaluate`.
- Remove the `first`/`refreshed` double-write block; keep the reload to get the new state revision for provenance.
- If P1-8 has landed, the manifest is written in the same pass.

## Implementation steps

1. Refactor `runClaim` to single write.
2. Batch the state registration (one `executeAuditAssessment` per check).
3. Test with an artifact-write counter.

## Testing

- Unit/integration: artifact write count per check equals 1; evidence validates.
- Regression: `probe-run.test.ts` updated; full suite green.

## Risks

- The reload between write and record must still happen (state revision may change after registration); keep it, only remove the duplicate write.

## Acceptance criteria

- One write per check; no duplicate screenshots.
- Evidence validation passes unchanged.
- Standards and tests pass.

## Sequencing

Merge with P1-8 (lightweight evidence) or land after it. Independent of all other items.
