# Lightweight evidence: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P1-8.

## Summary

Shrink the evidence ritual so the agent spends turns on judgment, not on envelope bookkeeping. Keep run/check/attempt/state linkage; replace per-artifact provenance mirroring and per-state pre-registration with a single manifest hash per attempt.

## Objectives and scope

In scope:

- Contracts: simplify `assessmentArtifactEnvelopeSchema` and `EvidenceProvenance` artifact requirements.
- Validation (`evidence/validation.ts`, `evidence/artifacts.ts`): drop envelope-mirroring, exact `capturedAt` equality, and pre-registration checks.
- Runner (`probe-run.ts`, `probe-artifacts.ts`): write artifacts once (see also P1-12), emit one manifest per attempt.
- Skill: rewrite the evidence chapter to match.

Out of scope:

- Removing attempt/state linkage entirely.
- Changing the `verified`/`unverified` status vocabulary.

## Assumptions

- Tamper evidence does not require per-file SHA-256 mirroring inside each file; a manifest hash covers it.
- Old evidence files remain readable; new validation accepts both old and new envelope shapes during migration.

## Requirements

### Functional

- FR-1: Artifacts no longer repeat provenance fields; each artifact file carries only `{ kind, content }` plus the manifest reference.
- FR-2: Artifact paths are registered by the recording step (single write), not by a separate `audit state` call before recording.
- FR-3: Site checks cite the environment's states once in the record, not in every artifact envelope.
- FR-4: One `attempt-manifest.json` per attempt lists artifact hashes and capture times; validation checks the manifest once.
- FR-5: `recordEvidence` remains the single validation entry point; rejection reasons remain specific.

### Non-functional

- NFR-1: Validation-rejection rate on the fixture suite drops measurably; record the before/after rate in the PR.
- NFR-2: Old runs validate without migration.

## Design

- Contracts: `assessmentArtifactEnvelopeSchema` reduces to `{ kind, content }`; provenance artifacts keep `{ kind, path, sha256, capturedAt }` but are validated against the manifest, not each envelope.
- `evidence/artifacts.ts`: delete the envelope-mirroring block in `validateArtifactContent`; validate only kind-specific content and manifest hash.
- `evidence/validation.ts`: delete `validateStates` per-artifact fan-out; keep the record-level state check.
- `probe-artifacts.ts`: `writeProbeArtifacts` emits the manifest; `probe-run.ts` removes the register-then-rewrite sequence (coordinated with P1-12).

## Implementation steps

1. Contracts: minimal envelope; keep old schema for reads (`z.union` with deprecated marker, not `@deprecated` annotation).
2. Validation: strip mirroring/registration; add manifest check.
3. Writers (`probe-artifacts.ts`, `probe-record.ts`, CLI `audit record`): new shape.
4. Skill + docs: rewrite evidence chapter with a minimal example.
5. Migration note + before/after rejection-rate measurement on the fireside fixture.

## Testing

- Unit: old-envelope evidence still validates; new-envelope evidence validates; truncated/corrupt manifest rejected.
- Integration: record+evaluate a check end-to-end without a separate `audit state` registration call.
- Measurement: run the live fixture suite pre/post; report the rejection-rate delta.

## Risks

- Reduced strictness may hide real staleness: mitigate by keeping record-level state revision/fingerprint checks (they catch the important case).
- Two envelope shapes during migration: mitigate with union parsing and a removal task after one release.

## Acceptance criteria

- Agent flow per check drops the pre-registration and hand-built envelope steps.
- Rejection rate near zero on the fixture suite.
- Standards and tests pass.

## Sequencing

Blocks P1-12 (single artifact write) — merge them or sequence this first. Independent of P1-7.
