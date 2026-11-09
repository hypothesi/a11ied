# Batch claims per state: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P0-6.

## Summary

Allow `audit next --count N` to claim N checks that share a state, so the agent pays one state-restore per state instead of one per criterion. Most state procedures (1.1.1, 1.3.1, 2.4.2, 4.1.2) read the same tree and transcript.

## Objectives and scope

In scope:

- Contracts: `next` gains `count` (default 1, max 20).
- Coordinator: claim up to N runnable checks for one state (same `environmentId` + first `stateId`).
- CLI/MCP parity: `audit next --count` and `audit_assessment` `next` with `count`.
- Evidence flow unchanged per check (`record` + `evaluate` per check ID).

Out of scope:

- Parallel execution of claimed checks (they still evaluate serially; the saving is the restore, not the judgment).
- Batching across states or journeys.

## Assumptions

- `activeCheckId` becomes `activeCheckIds` (array) with backward-compatible read of old runs holding a single ID.
- The agent judges each claimed check separately; batching does not merge verdicts.

## Requirements

### Functional

- FR-1: `nextAuditAssessment(file, { count })` claims up to `count` queued checks sharing the top-severity state (respecting P0-5 ordering).
- FR-2: Each claimed check increments `attempts` and sets `attemptStartedAt` once for the batch.
- FR-3: `resume`, `block`, and `evaluate` work per check ID inside a batch; evaluating one does not release the others.
- FR-4: The `next` response lists all claimed checks with their procedures and the shared state context once.

### Non-functional

- NFR-1: Batch claims must be atomic (all or none) under the run file lock.
- NFR-2: `status` shows batch membership.

## Design

- Contracts: `audit-assessment.ts` `next` schema gains `count`; `AuditRun.activeCheckId` → `activeCheckIds: string[]` with a migration shim in `run-store.ts`.
- Lifecycle: `selectNextChecks(run, count)` picks the top state by severity, then the top N checks for that state. `TRANSITIONS` in `run-state.ts` allows `queued → running` for the batch set.
- CLI: `--count` flag on `audit next`; MCP `audit_assessment` `next` accepts `count`.
- Status: `activeCheckIds` replaces `activeCheckId` in `AuditAssessmentResponse`.

## Implementation steps

1. Contracts + `run-store.ts` migration.
2. `run-lifecycle.ts`: `selectNextCheck` → `selectNextChecks`; atomic batch claim inside `updateAuditRun`.
3. `run-state.ts`: batch-aware transitions; `activeCheckId` cleanup on evaluate/block.
4. CLI (`audit-assessment.ts`) + MCP (`audit-assessment.ts` tool) wiring.
5. Skill: document batch workflow (claim, judge N, evaluate N).

## Testing

- Unit: batch of 5 on one state claims 5; batch spanning two states claims only the top state; `count: 1` unchanged.
- Integration: interrupt mid-batch → `resume` blocks the unfinished checks only.
- Concurrency: second `next` while a batch is active throws (existing `audit-check-running`).

## Risks

- Larger active set complicates recovery: mitigate by keeping per-check `attemptStartedAt` and explicit retry IDs (already supported).
- Agents may batch too aggressively and exceed context: cap at 20, matching the status page limit.

## Acceptance criteria

- One state restore serves up to 20 checks.
- Interrupted batch recovers cleanly.
- Standards and tests pass.

## Sequencing

Depends on P0-5 ordering for batch selection. Independent of P0-4.
