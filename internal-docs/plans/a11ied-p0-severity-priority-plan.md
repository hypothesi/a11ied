# Severity priority and early verdicts: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P0-5.

## Summary

Order the obligation queue by impact and publish a per-page verdict as soon as its state checks complete, instead of deferring site and journey checks to the end. A navigation failure should surface after page 1, not after 1,104 state checks.

## Objectives and scope

In scope:

- Queue ordering in `getQueuedChecks` / `selectNextCheck` (`run-lifecycle.ts`): severity first, then page, then site/journey.
- Per-page (and per-group) verdict in `audit status` and `report build`.
- Preemption rule: a new critical failure reorders the remaining queue.

Out of scope:

- Changing which checks must complete for a conformance claim.
- Severity assignment of criteria (use existing axe impact + probe finding impact).

## Assumptions

- Axe `impact` and probe `finding.impact` are available at claim time for ordering; behavioral checks without a finding use the criterion default (`moderate`).
- Per-page verdicts are advisory until site/journey checks complete; the report labels them as such.

## Requirements

### Functional

- FR-1: `getQueuedChecks` sorts by (severity rank, page order, scope rank) where scope rank is state < journey < site but severity dominates.
- FR-2: `audit next` returns the highest-severity claimable check, not the first in page order.
- FR-3: `audit status` includes `pageVerdicts`: per page, counts of failed/passed/cantTell/inapplicable plus the worst finding.
- FR-4: `report build` can emit a per-page verdict section before full completion (`--draft` already exists; this adds page granularity).

### Non-functional

- NFR-1: Ordering must be stable and deterministic (same run → same order) for replay.
- NFR-2: No change to `complete` semantics.

## Design

- Severity rank: `critical(4) > serious(3) > moderate(2) > minor(1) > unknown(0)`, sourced from `check` (axe impact via `procedureId → rule` lookup) and probe findings already recorded.
- `run-lifecycle.ts`: replace page-order sort with a compound comparator; keep the existing `unsupported` skip.
- `run-status.ts`: compute `pageVerdicts` from assessed check IDs grouped by `isPageStateMatched`.
- `report/*`: render page verdicts in the HTML/JSON bundle.

## Implementation steps

1. Severity lookup helper (criterion → impact) from `wcag-data` + axe data.
2. `run-lifecycle.ts`: new comparator; tests for stable ordering.
3. `run-status.ts` + contracts: `pageVerdicts` in `AuditAssessmentStatus`.
4. Report renderer + `report build` draft path.
5. Skill: document that the queue is severity-ordered and page verdicts are partial.

## Testing

- Unit: comparator (critical before moderate regardless of page; site checks interleave by severity instead of all last).
- Integration: fixture with a critical axe failure on page 2; assert it is claimed first and the page verdict shows it.
- Regression: saved-run ordering is by claim time, not retroactively reordered.

## Risks

- Severity ordering may starve low-severity checks on huge sites: mitigate by keeping a FIFO guarantee within each severity tier.
- Page verdicts may be misread as conformance: label them "partial page verdict" in all renderers.

## Acceptance criteria

- First claim after a known critical failure is that failure's check.
- Per-page verdicts appear before site completion.
- Standards and tests pass.

## Sequencing

Independent of P0-4 and P0-6; pairs with P0-6 (batch by state) — order within a batch by severity.
