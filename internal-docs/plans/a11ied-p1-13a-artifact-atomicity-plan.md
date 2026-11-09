# 13a atomic artifact writes and per-attempt filenames: implementation plan (2026-11-09)

> Superseded by `a11ied-p1-13-unified-file-governance-plan.md` (Phase 2). Kept as step detail.

Source: `internal-docs/audit-performance-quality-review.md` P1-12, concurrency review 2026-11-09.

## Summary

Artifacts in `packages/core/src/audit/probe/probe-artifacts.ts` (`writeProbeArtifacts`) and `probe-observe.ts` (`observePage`) are written with raw `writeFile` to deterministic paths `artifacts/<checkId>-<kind>.*` with no lock and no atomicity. Two processes on the same claim overwrite each other, a reader can see a torn file, and a retry clobbers the previous attempt's bytes. Replace these with `writeBytesAtomic` (already present in `packages/core/src/files/atomic-json.ts`) and make filenames attempt-scoped.

## Objectives and scope

In scope:

- `probe-artifacts.ts`: `writeProbeArtifacts` -> `writeBytesAtomic`; filename becomes `artifacts/<checkId>-a<attempt>-<kind>.*`.
- `probe-observe.ts`: `observePage` state screenshot -> `writeBytesAtomic` (path already unique per page; keep `artifacts/<pageId>-state.png` but write atomically).
- Delete the register-then-rewrite double write in `probe-run.ts:runClaim` (merge with P1-12); single write per check.
- Update `probe-record.ts` + `evidence/artifacts.ts` readers to accept the new path shape (they only store/validate `artifact.path`, so no schema change is needed).

Out of scope:

- Lock budget and validation ordering (13b).
- Holding a lock across claim-record-evaluate (13c).
- Report/discovery writers (13e).

## Assumptions

- `artifact.path` values are compared as resolved paths under the run directory by `evidence/artifacts.ts:validateArtifact`; changing the filename segment does not affect validation beyond the registered path.
- Attempt is `check.attempts` at claim time (`run-state.ts:startAssessmentCheck` already increments it before evidence collection).
- `writeBytesAtomic` fsyncs and renames; a crash mid-write leaves at worst an orphaned `*.tmp` file, never a torn artifact.

## Requirements

### Functional

- FR-1: Every artifact write goes through `writeBytesAtomic`; no `writeFile` remains in `probe/` for artifact bytes.
- FR-2: Artifact filenames include the attempt (`-a<attempt>-`); two attempts of the same check never share a path.
- FR-3: `runClaim` writes artifacts exactly once per check (no first/refreshed double write, no second screenshot).
- FR-4: A failed write leaves no partial artifact at the final path (crash safety).

### Non-functional

- NFR-1: SHA-256 in the returned `Artifact` list is computed from the already-built `Buffer` (unchanged) and must match the bytes on disk after the atomic rename.
- NFR-2: No new dependencies.

## Design

- `probe-artifacts.ts`:
   - Import `writeBytesAtomic` from `../../files/atomic-json.js`; drop `writeFile` import.
   - `path = artifacts/${checkId}-a${attempt}-${kind}.${ext}`.
   - `await writeBytesAtomic(body, join(dirname(runFile), path))`.
- `probe-observe.ts`: same replacement for the state screenshot.
- `probe-run.ts`: remove the `first`/`refreshed` pattern; write once, register once, reload run once for the new revision, then record.

## Implementation steps

1. Replace `writeFile` with `writeBytesAtomic` in both files; add attempt to probe artifact filenames.
2. Collapse `runClaim` to a single write (P1-12 merge).
3. Update `probe-run.test.ts` / `probe-artifacts` expectations for the new filenames.
4. Grep `packages/core/src/audit/probe/` to confirm no bare `writeFile` remains for artifact bytes.

## Testing

- Concurrent writes: spawn two `writeProbeArtifacts` for the same check/attempt with different bodies; assert the final file equals one complete body (never a mix) and its hash matches one returned artifact.
- Retry isolation: two attempts produce two distinct files; old attempt's hash still validates.
- Crash safety: writes interrupted mid-rename leave no torn artifact at the final path (simulate by stubbing `rename` to throw).
- Regression: `npm run standards`, `npm test` green; `probe-run.test.ts` updated.

## Risks

- Renaming artifacts orphans old `artifacts/<checkId>-<kind>.*` files from runs in progress: mitigate by accepting both shapes on read (validation only checks the registered path) and leaving old files harmlessly in place.
- `Promise.all` parallel writes to sibling files remain safe because each uses a unique temp file; no lock is needed for distinct paths.

## Acceptance criteria

- No `writeFile` for artifact bytes in `probe/`.
- Artifact paths are attempt-unique.
- Concurrent writers never produce torn or mixed artifacts.
- Standards and tests pass.

## Sequencing

Merge with P1-12. Prerequisite for 13c (transactional claims), which assumes artifact writes are already atomic and unique.
