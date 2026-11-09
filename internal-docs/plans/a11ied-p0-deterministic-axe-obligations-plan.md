# Deterministic scanner obligations: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P0-1.

## Summary

Promote the axe scanner from "procedure zero" to a countable, closable obligation. Today `run-obligations.ts` filters `axe_scan` out of the obligation catalog, so a passing scan completes zero checks and the agent must re-prove contrast, name, and structure that axe already measured. This plan makes a per-state `axe_scan` check closable on `passed`/`inapplicable` with the scan artifact attached, and narrows the behavioral procedure to the part axe does not cover.

## Objectives and scope

In scope:

- Keep `axe_scan` in `getAssessmentCatalog` (`packages/core/src/audit/run-obligations.ts`); stop filtering it.
- Define per-criterion completion rules for `axe_scan`: which axe rules, what counts as `passed`, `failed`, `inapplicable`, `cantTell` (incomplete rules).
- Record the scan as evidence (`observation` + `action-trace`, plus the raw axe JSON as a registered artifact) and allow `audit evaluate` to close it without agent UI input.
- Update `test-methods` generation so criteria whose behavioral remainder is empty are marked `automated`; keep `hybrid` for the remainder.
- Update `full-site-audit` skill: scanner runs first, closes scanner checks, agent handles only the remainder.

Out of scope:

- Replacing axe-core or changing rule selection in `packages/core/src/axe/selection.ts`.
- Automatic remediation or baseline acceptance.
- Native-app scanner procedures (axe does not assess native controls; keep the existing limitation).

## Assumptions

- Axe rule-to-criterion mapping in `packages/wcag-data/data/generated/axe-rules.2.2.json` is authoritative; where a rule maps to multiple criteria, each `axe_scan` check records the same scan with a criterion-specific verdict.
- Axe `incomplete` results cannot close a check; they yield `cantTell` with the rule ID and a recovery note.
- Existing saved runs keep their check IDs; new `axe_scan` checks are appended by `queueAssessmentObligations` without discarding evidence.

## Requirements

### Functional

- FR-1: `listAssessmentObligations` includes one `axe_scan` check per state per criterion that has mapped axe rules.
- FR-2: `runAxe` per state is executed once and shared across all `axe_scan` checks for that state (reuse `PageEvidenceCache` from `probe-site.ts`).
- FR-3: A `failed` axe rule closes its `axe_scan` check as `failed` with a finding (title, user impact, remediation from `helpUrl`).
- FR-4: All rules `pass` or `inapplicable` closes as `passed`; all `inapplicable` closes as `inapplicable`; any `incomplete` without a violation yields `cantTell`.
- FR-5: The behavioral procedure remains queued; its `applicability` text is updated to name the axe-covered portion it does not repeat.
- FR-6: `audit status` shows scanner vs behavioral progress separately.

### Non-functional

- NFR-1: One axe run per state (no N×M browser launches).
- NFR-2: Scanner closure must be reproducible from the stored axe JSON alone.
- NFR-3: No new dependencies; verify license policy if any are added.

## Design

- Obligations: remove the `.filter((procedure) => procedure.procedureId !== 'axe_scan')` in `getAssessmentCatalog`. Check identity already includes `procedureId`, so no schema change is needed.
- Evidence: scanner checks use `source: browser`, `mode: semiAutomatic` (actor `a1 audit probe` or coordinator), artifacts `observation` (scan summary) and `action-trace` (single scan action), plus the axe JSON file registered on the state.
- Validation: `getRequiredCapabilities` for `axe_scan` is `rendered-ui` + `dom`; environments without those mark the check `unsupported`, not `cantTell`.
- Strategy data: regenerate `strategy.2.2.json` with `preferredEvidenceMode: automated` where the behavioral remainder is empty; `test-method-summary` then shows a non-zero automated count.
- Report: scanner failures surface as findings immediately; scanner passes are reported as "scanner portion passed, behavioral remainder pending" until the behavioral check closes.

## Implementation steps

1. `run-obligations.ts`: include `axe_scan`; add a `getScannerClosure` helper mapping axe results to outcomes.
2. `probe-site.ts` / `probe-run.ts`: run axe once per state, store the JSON artifact, and evaluate all `axe_scan` checks for that state in one pass.
3. `assessment-command.ts`: allow `evaluate` for `axe_scan` when the stored scan artifact validates.
4. `wcag-data` procedures and strategy generation: update behavioral `applicability` to exclude the axe-covered rules; regenerate artifacts; update `test-method-summary`.
5. Skills (`full-site-audit`, `a11ied`): document the two-step check (scan closes, agent judges remainder).
6. Docs: `packages/docs` audit guides; update `cli-purpose-audit.md` exit-code and coverage claims if they change.

## Testing

- Unit: `getScannerClosure` mapping (pass/fail/inapplicable/incomplete/mixed) in `packages/core/src/audit/run-lifecycle.test.ts` style.
- Integration: a fixture page with a known axe violation and a clean page; assert `axe_scan` closes `failed`/`passed` without agent input while the behavioral check stays queued.
- Regression: run the existing `npm test` suite; assert obligation counts for the fireside fixture drop by the scanner portion.
- Manual: `a1 audit run` + `a1 audit probe` on a 3-page site; verify per-state scanner closure and unchanged behavioral queue.

## Risks and mitigations

- Axe passes may give false confidence: mitigate by keeping the behavioral remainder explicit in every report and skill text.
- Rule-to-criterion overlap: a single rule mapping to two criteria fails both scanner checks; document this in the evidence note.
- Saved runs: old runs lack `axe_scan` checks; queue them on next `status`/`next` without revoking existing evidence.

## Acceptance criteria

- A clean axe scan closes its `axe_scan` checks with no agent step.
- A violating rule closes its check as `failed` with a reproducible finding.
- The agent loop skips closed scanner checks; total agent obligations per state drop from 46 to the behavioral remainder only.
- `npm run standards` and `npm test` pass.

## Sequencing

Depends on nothing. Blocks P0-2 (probe split) and P1-11 (single-page observation), which reuse the per-state scan.
