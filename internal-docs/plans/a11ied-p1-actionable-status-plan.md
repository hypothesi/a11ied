# Actionable status: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P1-9.

## Summary

Replace four paginated status lists with one actionable page: the next 20 things the agent can do (claimable, blocked with reason, stale) plus a coverage summary. The agent should never enumerate 1,251 obligations to decide what to do next.

## Objectives and scope

In scope:

- `audit status` response shape (`assessment-command.ts`, `run-status.ts`, contracts): `actionable` list + `coverage` summary; keep paginated lists behind `--full`.
- MCP `audit_assessment` `status` parity.
- Skill text: "read status for the next action" replaces "read every page".

Out of scope:

- Changing coverage computation (`buildAuditAssessmentSnapshot` logic stays).
- Removing the full lists (they remain available for reports and debugging).

## Assumptions

- The agent's decision needs: claimable checks (with severity), blocked checks (with reason), stale checks (with what changed), and the coverage counts. It does not need all states/journeys/progress up front.

## Requirements

### Functional

- FR-1: `status` returns `actionable: []` (max 20 by default) each with `{ checkId, criterionId, kind: claimable|blocked|stale|needs-review, reason?, nextAction? }`.
- FR-2: `status --full` (CLI) / `full: true` (MCP) returns the current four paginated lists unchanged.
- FR-3: Ordering of `actionable` matches the `next` ordering (severity-first, per P0-5).
- FR-4: `coverage` summary (`total/attempted/assessed/unresolved`) is always included.

### Non-functional

- NFR-1: Default status payload must stay small even for 1,000+ check runs; assert a size budget in tests.
- NFR-2: Existing `status` consumers (report builder, tests) keep working via `--full`.

## Design

- Contracts: `AuditAssessmentResponse` gains `actionable` and `coverage` at top level; `getPage` helpers retained for `--full`.
- `run-status.ts`: `buildActionableList(run, assessedIds, issues)` derives the 20 items from queued/running/blocked/stale/unsupported checks.
- `assessment-command.ts`: `buildResponse` branches on `full`; default builds the actionable page.
- CLI: `audit status --full` flag; MCP: `full` boolean in the `status` schema variant.

## Implementation steps

1. Contracts + `run-status.ts` actionable builder.
2. `assessment-command.ts`: default vs full response.
3. CLI + MCP wiring; update `run-state-and-decisions.md` pagination text.
4. Payload-size test (fixed limit for 2,000-check run).

## Testing

- Unit: actionable list contents and ordering on a fixture with all check kinds.
- Integration: `next` after `status` claims the first actionable item.
- Regression: `--full` output identical to pre-change output.

## Risks

- Agents may miss context only present in full lists: mitigate by keeping `next` context (states/journey) and documenting when `--full` is needed.

## Acceptance criteria

- Default status fits one response for any run size.
- First actionable item matches `next`.
- Standards and tests pass.

## Sequencing

Depends on P0-5 ordering. Independent of other P1 items; P1-10 updates skill text alongside.
