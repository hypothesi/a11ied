# 13b lock budget and in-lock validation: implementation plan (2026-11-09)

> Superseded by `a11ied-p1-13-unified-file-governance-plan.md` (Phase 3). Kept as step detail.

Source: concurrency review 2026-11-09; extends `packages/core/src/files/atomic-json.ts` and `packages/core/src/evidence/store.ts`.

## Summary

`withFileLock` uses `proper-lockfile` with `LOCK_RETRIES = 8`, `25-100ms` backoff — roughly 600ms of contention budget — then throws. Long critical sections (notably evidence revalidation that hashes every artifact inside `transitionAssessmentCheck`) exceed that, so concurrent agents get spurious lock errors instead of queueing. Separately, `recordEvidence` validates before acquiring the evidence lock, so two agents can both validate against the same snapshot and then append conflicting records. Fix the budget and move validation inside the lock.

## Objectives and scope

In scope:

- `files/atomic-json.ts`: raise/backoff-adjust the retry budget and add an explicit stale-lock policy; surface the wait time (metric/log at a threshold).
- `evidence/store.ts:recordEvidence`: move `validateEvidenceRecord` (and `validateEvidenceTest`) inside `withFileLock(file)`.
- `evidence/store.ts:readEvidence`/`clearEvidence`: already lock; verify reads hold the lock for the whole read+revalidate.

Out of scope:

- Atomic artifact contents (13a).
- Holding a lock across claim-record-evaluate (13c).
- Replacing `proper-lockfile` (license/dependency policy unchanged).

## Assumptions

- `proper-lockfile` defaults `stale: 10s` (package default) are acceptable; we configure `stale` explicitly and do not rely on NFS lock semantics (local runs only).
- Validation inside the lock is safe: it reads `run.json` and artifact files but never acquires the `run.json` lock from inside the `evidence.jsonl` lock in a way that reverses ordering. Keep a documented lock order: `run.json` before `evidence.jsonl` wherever both are held (see 13c).

## Requirements

### Functional

- FR-1: Lock acquisition waits at least 10s under contention before throwing; the error names the path and the wait budget.
- FR-2: `recordEvidence` runs validation and append inside one `withFileLock(file)` scope.
- FR-3: Two concurrent `recordEvidence` calls for the same check serialize: the second claim's validation sees the first record and returns `audit-evidence-conflict` instead of appending a conflicting row.
- FR-4: `stale` is set explicitly (e.g. 30s) with a comment that shorter than the longest critical section would break it.

### Non-functional

- NFR-1: No critical section may exceed the stale timeout; add a measured test with a slow validator that still completes.
- NFR-2: Lock contention doesn't change the `withFileLock` API.

## Design

- `atomic-json.ts`: `retries: { retries: 100, minTimeout: 50, maxTimeout: 500 }` (~10s+) and `stale: 30_000` passed to `lock()`. Keep `waitingFiles` as the in-process FIFO.
- `store.ts`: restructure `recordEvidence` — parse + truncate outside, then `await withFileLock(file, async () => { validate; append })`.
- Document lock ordering in a comment on `withFileLock`: callers needing both locks acquire `run.json` first.

## Implementation steps

1. Raise retry budget + explicit `stale` in `withFilesystemLock`; name the path in the thrown error.
2. Move validation inside the evidence lock in `recordEvidence`.
3. Add a deadlock note (lock order) to `withFileLock` docs.
4. Add contention tests (below).

## Testing

- Contention: N=8 concurrent `recordEvidence` on distinct checks all succeed; same-check concurrent pair yields one success + one `audit-evidence-conflict`.
- Long section: a validator stub that sleeps 2s completes without lock errors.
- Stale recovery: a held lock older than `stale` is broken and the waiter proceeds (existing `proper-lockfile` behavior, now explicitly covered).
- Regression: `npm run standards`, `npm test` green; test runtime does not grow by more than the contention tests.

## Risks

- Holding the evidence lock during artifact hashing serializes all records: acceptable (records are small), but measure; if it shows up, batch hashing outside the lock after validation order is fixed.
- A longer budget hides a real deadlock as a 10s hang: the error message names the path so a hung holder is diagnosable.

## Acceptance criteria

- No spurious lock errors under 8-way contention on the fixture suite.
- Same-check concurrent records conflict deterministically.
- Standards and tests pass.

## Sequencing

After 13a (artifact contents are stable before validation moves). Before 13c, which builds its transaction on the corrected lock.
