# 13c transactional claims (hold the run lock across claim-record-evaluate): implementation plan (2026-11-09)

> Superseded by `a11ied-p1-13-unified-file-governance-plan.md` (Phase 3). Kept as step detail.

Source: concurrency review 2026-11-09; builds on P0-6 batch claims (`a11ied-p0-batch-claims-plan.md`).

## Summary

Today `runClaim` (probe-run.ts) spans four separate lock acquisitions: write artifacts (unlocked) -> `audit state` (locks `run.json`) -> `recordEvidence` (locks `evidence.jsonl`) -> `evaluate` (locks `run.json`). Agent B can change a fingerprint between A's write and record, so A's evidence goes `stale` and the claim is wasted. Hold the `run.json` lock across the whole claim-record-evaluate unit so a claimed check cannot be invalidated mid-flight by another writer.

## Objectives and scope

In scope:

- A `withClaimLock` / extended `updateAuditRun` path that keeps the `run.json` file lock while the caller records evidence and evaluates.
- Batch claims: `next --count N` claims N same-state checks atomically and holds the lock across their record+evaluate group (P0-6).
- `assessment-command.ts`: `evaluate` and `block` accept the lock held by the batch transaction.

Out of scope:

- Sharded evidence files as an alternative (13d).
- Lock budget (13b).

## Assumptions

- Browser/SR work (the slow part: probing, screenshots, transcripts) happens **outside** the lock, between claim and record; the lock is only held for the short write+validate+transition critical section. This keeps the critical section in milliseconds.
- Lock order is `run.json` -> `evidence.jsonl` (13b); the transaction acquires them in that order and never the reverse.

## Requirements

### Functional

- FR-1: A claimed check's `attemptStartedAt`, state revisions, and fingerprints cannot change between claim and evaluate while the transaction is active; a competing writer either waits (queue) or is rejected with `audit-revision-conflict` (if it passed `expectedRevision`).
- FR-2: Batch of N: all N checks transition `running -> evaluated|blocked` atomically; an interrupt leaves the unfinished ones `blocked` with the existing resume reason.
- FR-3: No check is evaluable by two agents in the same transaction (the active-claim guard stays).

### Non-functional

- NFR-1: Lock hold time for record+evaluate stays < 1s on the fixture runs (measure; fail the test if not).
- NFR-2: The critical section never performs browser or screen-reader I/O.

## Design

- `run-store.ts`: add `withRunTransaction(file, fn)` wrapping `withFileLock(file)`; `fn` receives `{ run, save(next) }` so record+evaluate happen inside one read-modify-write.
- `run-lifecycle.ts` / `run-state.ts`: `nextAuditAssessment` inside the transaction claims the batch; the probe runner's record+evaluate calls join the same transaction instead of acquiring fresh locks.
- `evidence/store.ts`: `recordEvidence` gains an internal `recordEvidenceWithinRunLock` used by the transaction (validation order per 13b: `run.json` then `evidence.jsonl`).
- CLI/MCP unchanged (`audit next`, `audit record`, `audit evaluate` stay the agent-facing operations).

## Implementation steps

1. Add `withRunTransaction` to `run-store.ts`; keep `updateAuditRun` as the single-check shortcut built on it.
2. Convert `runClaim` to: (browser work, unlocked) -> `withRunTransaction(record + evaluate)`.
3. Add batch claiming (P0-6) on top of the same transaction.
4. Add a hold-time assertion test.

## Testing

- Two agents racing on the same check: exactly one claims it; the other gets `audit-check-running` or queues behind the transaction.
- Fingerprint change during browser work: transaction rejects with `audit-revision-conflict`; agent retries the check (no silent stale evidence).
- Interrupt mid-batch: unfinished checks end `blocked`, finished ones stay evaluated.
- Regression: `npm run standards`, `npm test` green; lock hold time logged in the contention test.

## Risks

- Crash while holding the lock: `proper-lockfile` stale recovery (13b, 30s) breaks the lock; the next `resume` blocks the interrupted claim (existing behavior).
- A long critical section blocks all other writers: mitigated by moving all slow I/O outside the transaction (browser work before claim, report rendering after).

## Acceptance criteria

- A claim cannot be invalidated by a concurrent writer mid-transaction.
- Batch claims transition atomically.
- Hold time < 1s measured; standards and tests pass.

## Sequencing

After 13a + 13b. Pairs with P0-6. Use 13d instead if the goal is true parallel judging rather than serialized transactions.
