# Template-group dedupe: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P0-4.

## Summary

Replace exhaustive per-page re-judgment of identical templates with an explicit, auditable template-group rule: one full assessment per group plus a per-page smoke check (axe + tree + spot check), disclosed in the report. This removes the current rule that forces re-judgment of the same header on 24 pages.

## Objectives and scope

In scope:

- State/journey grouping: allow the agent to declare a state as the representative of a template group (same nav, footer, component set).
- Obligation generation: full state procedures run once per group; every member page gets a smoke check.
- Report disclosure of groupings and the smoke results per member.
- Migration for saved runs (existing per-page checks stay; grouping applies to newly queued work).

Out of scope:

- Automatic template detection by the CLI (grouping is an agent judgment, recorded with evidence).
- Changing per-state staleness rules for non-grouped states.

## Assumptions

- The skill already groups pages by template for discovery; this plan promotes that judgment into coordinator state.
- A fingerprint change on any member revokes the group's full assessment (existing `stale` machinery).

## Requirements

### Functional

- FR-1: `AuditState` gains `templateGroupId` (optional) and `isTemplateRepresentative` (boolean).
- FR-2: `listAssessmentObligations` emits full state checks for representatives only; member states get one `smoke_check` procedure (axe + tree + spot heading/link check).
- FR-3: `audit state` input accepts the group fields; `audit status` shows group progress and member smoke results.
- FR-4: The report lists every group, its representative, members, and any smoke failure that re-queues full assessment for that member.

### Non-functional

- NFR-1: Grouping must be auditable from `run.json` alone (no chat transcript needed).
- NFR-2: Adding a member never invalidates the representative's existing evidence.

## Design

- Contracts: extend `auditStateSchema` (`audit-run.ts`) with the two fields; extend `checkId` derivation (`run-store.ts`) to include a `grouped: true` marker for smoke checks.
- Obligations: `run-obligations.ts` branches on representative vs member. Smoke procedure is a new `assessmentProcedure` (scope `state`, capabilities `rendered-ui`, `dom`, `keyboard`).
- Status: `run-status.ts` adds group rollup; site checks still run once per environment.
- Skills: replace "template similarity cannot certify" with the group rule and its disclosure requirement.

## Implementation steps

1. Contracts: schema + `getAssessmentCheckId` + `listAssessmentObligations`.
2. `run-state.ts`: accept/store group fields; revocation on fingerprint change (reuse `stale`).
3. `run-status.ts`: group progress + member smoke summary.
4. Report renderer (`packages/core/src/report/*`): group disclosure section.
5. Skill + docs: group declaration workflow with a worked example.

## Testing

- Unit: obligation generation for a 3-page group (1 full + 2 smoke, not 3 full).
- Integration: smoke failure re-queues full assessment for that member only.
- Regression: ungrouped runs unchanged (all states representatives by default).

## Risks

- Over-grouping hides a page-specific defect: mitigate with mandatory per-member smoke (axe catches most) and disclosure so the reader can judge.
- Under-grouping keeps the old cost: mitigate with a skill heuristic (same fingerprint + nav signature ⇒ suggest grouping).

## Acceptance criteria

- Grouped 24-page site drops from 1,104 state obligations to ~46 × group-count + smoke checks.
- Every report discloses groupings.
- Standards and tests pass.

## Sequencing

Depends on P0-1 (scanner closure) for the smoke check definition. Independent of P0-5/6.
