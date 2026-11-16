# Verdict store: implementation plan (2026-11-10, consolidated)

Current implementation boundary (November 11 recovery): this historical target design is
not evidence of completed capabilities or a conformance assessment. Use
[`automated-rule-boundaries.md`](../automated-rule-boundaries.md), the maintained N5
facade plan, and the shipped `a11ied` skill for verified behavior. Non-axe probe
observations remain unresolved; missing facts do not prove absence. Collector receipts
bind captures but do not establish complete procedure execution. Native, site and journey
claims require their supported reader/coordinator evidence. Template members are assessed
independently. Validation results and source hashes are in
[`review-recovery.json`](../validation/review-recovery.json).

Source: `internal-docs/capabilities-review-and-target-design.md` findings 1–2 and `internal-docs/audit-performance-quality-review.md`.
Consolidates and supersedes:

- `a11ied-p0-deterministic-axe-obligations-plan.md` (P0-1 deterministic scanner closure)
- `a11ied-p0-probe-decisive-advisory-plan.md` (P0-2 decisive Tier 0/1 vs. advisory Tier 2 split)
- `a11ied-p0-template-dedupe-plan.md` (P0-4 template-group dedupe and member smoke check)
- `a11ied-p0-severity-priority-plan.md` (P0-5 severity priority ordering and early page verdicts)
- `a11ied-p1-lightweight-evidence-plan.md` (P1-8 lightweight evidence via bundle references)
- `a11ied-proof-5qp` (measurement soundness: criterion-specific measurements instead of synthetic `0`/`1` counts)

## Summary

Replace three unrelated verdict shapes (`AxeVerdict`, probe `Judgement`, `AssessmentCheck`/`EvidenceRecord`) with one `Verdict` per criterion per state. All engines — axe, DOM facts, programmatic probes, and agent judgments — write the same object to `verdicts.jsonl` via the unified persistence layer (`P1-13`). Tier 0 and Tier 1 verdicts close automatically from the `ObservationBundle` (`N2`) without agent turns; Tier 2 advisory findings surface with concrete `nextAction` instructions, ordered by severity impact (`critical` → `minor`) and deduplicated across template groups.

## Objectives and scope

In scope:

- `packages/contracts`:
   - `verdictSchema` (`{ id, criterionId, stateId, procedureId?, tier: 0 | 1 | 2 | 3, outcome, confidence, impact, method, evidence: ObservationRef[], measurements?: MeasurementRecord[], repro, nextAction?, exclusionReason? }`).
   - Template-group fields on states (`templateGroupId`, `representativeStateId`, `memberRole: 'representative' | 'member'`) and `template_smoke` obligation for non-representative members (P0-4).
   - First-class `exclude` scope rules (`selectors`, `urlPatterns`, `stateIds`, `reason`) and `excluded` check/verdict status so out-of-scope third-party widgets or journeys are disclosed cleanly rather than left as unresolved `cantTell` blockers.
- Deterministic & programmatic engine (`packages/core/src/verdict/`):
   - Tier-0 (`confidence: 1.0`) and Tier-1 (`confidence: 0.7–0.95`) scoring from `ObservationBundle` (axe + ACT + DOM facts + tree + computed contrast/layout measurements + virtual SR transcript), closing checks with zero agent calls (P0-1, P0-2).
   - Strict soundness guardrails: Tier-0 `passed` is emitted only for ACT-complete rules or verified element absence (`inapplicable`); semantic quality checks (alt text accuracy, heading hierarchy vs. visual structure, link/title descriptiveness, contrast over gradients/images/transitions) emit Tier-2 `needsReview` with pre-populated `ObservationRef[]` and `nextAction` unless a deterministic failure is found.
   - Real criterion-specific `MeasurementRecord[]` (contrast ratios in `:1`, target dimensions/spacing in `px`, viewport overflow in `px`, animation duration in `ms`, flash frequency in `Hz`) replacing the synthetic `unit: 'failing probes per page'` placeholder (`a11ied-proof-5qp`).
- Coordinator queue, priority & dedupe:
   - Representative states carry full Tier-2 criterion checks; member states carry only `axe_scan` (Tier-0) + `template_smoke`, auto-revoking to `stale` if the representative's fingerprint changes (P0-4).
   - Queue comparator orders claimable Tier-2 work by `(statePriority, impactOrder[criterionId], criterionId, procedureId)` so `critical` and `serious` checks run first, and exposes partial `pageVerdicts` (`failing` | `passing-so-far` | `blocked` | `excluded` | `unstarted`) after the first failing check (P0-5).
- Report renderer & professional VPAT/ACR output (`packages/core/src/report/`):
   - Reads verdicts directly (`criteria-rollup` deleted).
   - Adds **Executive Summary & Remediation Roadmap** grouped by template/component group and ordered by severity (`critical` → `minor`).
   - Adds **WCAG 2.2 Level A & AA Conformance Table (VPAT / ACR view)** mapping each of the 55 A/AA criteria to _Supports_, _Partially Supports_, _Does Not Support_, _Not Applicable_, or _Not Evaluated_, plus **Statement of Partial/Scoped Conformance** listing `excluded` scope rules and template-group inheritance.
   - Adds **Explicit Methodology & Assistive Technology Disclosure** breaking down verdicts by Tier (0/1/2/3) and distinguishing Virtual SR (`virtual-dom`) from Native AT (`voiceover` / `nvda`).

Out of scope:

- Procedure `toolCalls` templates and skill generation (`N3`).
- Single-page browser observation and cache collection internals (`N2`).

## Requirements

- FR-1: One `Verdict` per `(criterionId, stateId, procedureId)`; re-scoring the same `ObservationBundle` is idempotent (deterministic verdict ID).
- FR-2: `confidence: 1.0` is restricted to Tier-0 deterministic rules (ACT/axe violations, syntactic checks like `3.1.1` valid `<html lang>`, or verified element absence). No probe may return a false-confidence `pass` on semantic criteria without agent verification.
- FR-3: Every quantitative probe (1.4.3, 1.4.4, 1.4.10, 1.4.11, 1.4.12, 2.2.2, 2.3.1, 2.4.7, 2.4.11, 2.5.8) populates `measurements: MeasurementRecord[]` with real physical units; synthetic `failing probes per page` counts are deleted (`a11ied-proof-5qp`).
- FR-4: Template groups reduce obligation count on a 24-page / 5-template site by ~70%; changing a representative's DOM fingerprint marks member verdicts `stale`.
- FR-5: Scope exclusions (`exclude` policy) transition matching checks/states to `excluded` with a mandatory `exclusionReason`, removing them from `unresolved` blockers and listing them in the report's scope disclosure.
- FR-6: `cantTell` / `needsReview` requires a structured `nextAction` naming the missing capability, authorization, or agent inspection step.

## Implementation steps

1. **Contracts & Schemas (`packages/contracts`)**: Define `verdictSchema`, `measurementRecordSchema`, `observationRefSchema`, template-group state fields (`templateGroupId`, `representativeStateId`, `memberRole`), `exclude` scope schema, and `pageVerdictSchema`.
2. **Tier 0/1 Verdict Engine & Decisive/Advisory Split (`packages/core/src/verdict/`)**: Audit all 55 criteria; implement pure `(bundle, criterion) -> Verdict` functions with strict Tier-0/1 vs. Tier-2 advisory boundaries (P0-1, P0-2) and real criterion-specific `MeasurementRecord[]` (`a11ied-proof-5qp`); delete `probe-run.ts` double-recording.
3. **Lightweight Bundle References (`packages/core/src/evidence/` & `verdict/`)**: Replace verbose artifact envelope mirroring with `ObservationRef[]` pointing into `cache/<fingerprint>/` (`P1-8`) and store verdicts via `P1-13` (`withRunTransaction` / `appendLine`).
4. **Template-Group Dedupe & Scope Exclusions (`packages/core/src/audit/`)**: Implement representative vs. member obligation expansion (`template_smoke`), fingerprint-change revocation (`stale`), and first-class `exclude` rules (by selector, URL pattern, or `stateId`).
5. **Severity Priority Queue & Partial Page Verdicts (`packages/core/src/audit/`)**: Order claimable checks by criterion impact (`critical` → `serious` → `moderate` → `minor`), compute live `pageVerdicts` (`failing` as soon as one check fails), and allow draft reports at any point (P0-5).
6. **Report Renderer, VPAT/ACR Table & Executive Summary (`packages/core/src/report/`)**: Read from the verdict store; render the Executive Summary + Component Remediation Roadmap, WCAG 2.2 A/AA VPAT Conformance Table, Template-Group & Scope Exclusion Disclosures, and Tier/AT Provenance Breakdown.

## Testing

- **Idempotence & Soundness**: Scoring the same `ObservationBundle` twice yields one identical verdict; false-pass regression tests verify that semantic criteria (e.g., `1.1.1` non-empty alt, `1.4.1` color reliance, `1.4.3` gradient/transition incomplete, `2.1.1` keyboard operability, `3.1.2` Latin foreign language, `3.2.6` help links without phone numbers) produce `needsReview` (Tier 2) rather than premature `pass`.
- **Measurements (`5qp`)**: Unit tests verify `measurements` contain real `contrastRatio`, `px`, `ms`, or `Hz` values and zero occurrences of `'failing probes per page'`.
- **Template Dedupe & Exclusions**: 5-page template group produces full obligations on the representative + `template_smoke` on the 4 members; fingerprint mutation revokes members to `stale`; excluding a state/selector marks it `excluded` with `unresolved === 0`.
- **Priority & Early Verdicts**: `critical` checks claim before `minor`; a single failure flips the page's `pageVerdict` to `failing`.
- **Report & VPAT**: HTML/JSON/EARL reports include the Executive Summary, VPAT criterion table, template-group disclosure, scope exclusions, and Tier/AT breakdown.

## Acceptance criteria

- One `Verdict` shape; no `AxeVerdict`/`Judgement`/`AssessmentCheck` triplication.
- Tier-0/1 criteria close with zero agent calls; zero synthetic measurements.
- Template dedupe, severity ordering, scope exclusions, and VPAT/Executive Summary reports work end-to-end.
- `npm run standards` and `npm test` pass.

## Sequencing

Depends on `P1-13` (unified persistence) and `N2` (observation bundle). Blocks `N5` (review facade).
