# Procedure done definitions: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P2-16.

## Summary

Give every procedure an explicit definition of done per outcome. For `inapplicable`, name the absence that must be observed (generalizing the existing `media-absence` path for 6 criteria). For `cantTell`, name the missing capability or authorization and the exact blocked-reason text. This gives agents the vocabulary the skill currently demands but never supplies.

## Objectives and scope

In scope:

- `procedures.ts`: extend the inapplicability model beyond `media-absence`; add `cantTell` blocker vocabulary per procedure.
- Contracts: extend `assessmentProcedureSchema` (`inapplicability` union + `blockers`).
- The 55 curated procedures and their `applicability`/`evaluation` text.
- Skill blocker guidance (replace "do not fill every criterion with the same blocker" with the vocabulary).

Out of scope:

- Changing required capabilities or evidence kinds (degree of difficulty stays).
- Allowing `cantTell` to complete the audit.

## Assumptions

- Every procedure where an absence is observable can state it (no media, no form, no animation, no live region, etc.).
- `cantTell` blockers are enumerable per procedure (capability missing, authorization missing, target unavailable) and shared across procedures where the cause is the same.

## Requirements

### Functional

- FR-1: `inapplicability` gains kinds beyond `media-absence` (e.g. `no-form`, `no-media-playback`, `no-animation`, `no-live-region`) each with required capabilities, evidence, and the observed-absence test.
- FR-2: Each procedure lists its allowed `cantTell` blockers as codes (`capability:measurement`, `auth:submission`, `target:unavailable`, …) with a template reason string.
- FR-3: `audit block --reason` validates against the procedure's blocker list (warn, not reject, during migration).
- FR-4: `next` returns the blocker vocabulary for the claimed check.

### Non-functional

- NFR-1: No procedure may list a blocker code that no capability or policy maps to.
- NFR-2: Regenerated strategy diff is reviewable per criterion.

## Design

- Contracts: `inapplicability: { kind: string, requiredCapabilities, requiredEvidence, observe: string }`. Media-absence keeps its strict inventory validation (`evidence/media-absence.ts`); new kinds reuse it or declare a simpler observation.
- `procedures.ts`: `seedSchema` gains `inapplicability` and `blockers`; curated JSON updated per criterion.
- `run-state.ts` `transitionAssessmentCheck(blocked)`: cross-check reason against the list (soft validation first).

## Implementation steps

1. Contracts: union schema + blocker codes.
2. Curated procedures: define absence tests and blockers per criterion (batched by family).
3. Validation: soft check in `transitionAssessmentCheck`; hard check after one release.
4. `next` response includes the vocabulary; skill updated.

## Testing

- Unit: each A/AA procedure has at least one inapplicability path or an explicit "no inapplicable path" statement.
- Integration: `audit block` with an off-list reason warns; with an on-list reason succeeds.
- Content review: family owners verify absence tests match the normative exceptions.

## Risks

- Overly broad inapplicability invites gaming: mitigate by requiring the observed-absence evidence (as `media-absence` already does).
- Blocker drift: mitigate with a test asserting every code maps to a capability or policy field.

## Acceptance criteria

- Every procedure defines done for all four outcomes.
- Agents have a closed vocabulary for `cantTell` reasons.
- Standards and tests pass.

## Sequencing

Depends on P1-8 (lightweight evidence) for evidence shape and P1-7 (templates) for `next` payload. Independent of P0 batching.
