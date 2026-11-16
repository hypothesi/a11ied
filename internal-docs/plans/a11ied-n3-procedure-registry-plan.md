# Procedure registry and generated skill: implementation plan (2026-11-10, consolidated)

Current implementation boundary (November 11 recovery): this historical target design is
not evidence of completed capabilities or a conformance assessment. Use
[`automated-rule-boundaries.md`](../automated-rule-boundaries.md), the maintained N5
facade plan, and the shipped `a11ied` skill for verified behavior. Non-axe probe
observations remain unresolved; missing facts do not prove absence. Collector receipts
bind captures but do not establish complete procedure execution. Native, site and journey
claims require their supported reader/coordinator evidence. Template members are assessed
independently. Validation results and source hashes are in
[`review-recovery.json`](../validation/review-recovery.json).

Source: `internal-docs/capabilities-review-and-target-design.md` finding 6 and `internal-docs/audit-performance-quality-review.md`.
Consolidates and supersedes:

- `a11ied-p1-executable-procedures-plan.md` (P1-7 executable procedure `toolCalls` templates)
- `a11ied-p2-procedure-done-definitions-plan.md` (P2-16 structured `done` definitions, blocker vocabulary, and generalized `inapplicability` kinds)
- `a11ied-p2-merged-skills-plan.md` (P2-14 single merged `a11ied/SKILL.md` with `full-site-audit` forwarding stub)

## Summary

Upgrade the 55 curated WCAG 2.2 A/AA procedures from passive prose into an executable registry that both the verdict engine (`N1`) and the agent (`N5`) consume: per criterion `{ tier, toolCalls: [{ tool, input, expect }], failureObjects, done }`. Generate the merged `packages/skills/a11ied/SKILL.md` skill, `review.next` agent prompts, and `wcag show` output directly from this registry so procedures, tool names, done definitions, and skills never drift.

## Objectives and scope

In scope:

- `packages/contracts`:
   - `procedureActionTemplateSchema` (`{ tool, args, expect, capturesArtifact? }`, P1-7).
   - `procedureDoneDefinitionSchema` (`{ passed, failed, inapplicable, cantTell }`, `blockerCodeSchema`, and generalized `inapplicabilityKindSchema` covering `no-media-playback`, `no-form`, `no-table`, `no-live-region`, `no-animation`, `no-timed-event`, `no-multipage-context`, `no-dragging`, `no-multipoint-gesture`, `no-authentication`, P2-16).
- `packages/wcag-data`:
   - `data/curated/desktop-procedures.json` + `src/test-methods/procedures.ts`: populate `tier`, `toolCalls`, and `done` across all 55 A/AA procedures, referencing the final `review.*` (`N5`) and `sr_*` / `a1 sr` (`N4`) verbs.
   - Regenerate `strategy.2.1.json`, `strategy.2.2.json`, and `generated-provenance.json`.
- `packages/wcag-engine`:
   - Expose `tier`, `toolCalls`, and `done` in `showWcagCriterion` and registry lookups.
- `packages/skills`:
   - Generate the unified `packages/skills/a11ied/SKILL.md` (Quick Page Check recipe, Full-Site AA Review batch recipe, and the 6 retained `a1 sr` command groups from `N4`) directly from the procedure + command registries (P2-14).
   - Replace `packages/skills/full-site-audit/SKILL.md` with a 15-line forwarding stub pointing to `a11ied/SKILL.md` for backwards compatibility.

Out of scope:

- Tier-0/1 scoring implementation (`N1`).
- Auto-running Tier-2 agent `toolCalls` inside the engine (the agent executes Tier-2 judgments using the pre-collected `ObservationBundle` or interactive `sr_*` / browser steps).

## Requirements

- FR-1: Every one of the 55 WCAG 2.2 A/AA criteria has a declared `tier` (`0..3`), `>= 1` machine-readable `toolCalls` entry (or explicit `humanOnly` reason), and a complete `done` definition (`passed`, `failed`, `inapplicable`, `cantTell`).
- FR-2: Generalized `inapplicability` proof (generalizing `media-absence.ts`) allows any criterion with a declared `inapplicability.kind` to close as `inapplicable` when the corresponding DOM/bundle query returns `count === 0`.
- FR-3: `cantTell` requires a `blockerCode` from the closed `blockerCodeSchema` enum (`capability-unsupported`, `external-submission-unauthorized`, `auth-credentials-missing`, `third-party-out-of-scope`, `hardware-sensor-unavailable`, `human-judgment-required`).
- FR-4: `packages/skills/a11ied/SKILL.md` is generated from the registry (`npm run generate:skills` / build step) and stays under 300 lines; `full-site-audit/SKILL.md` is a forwarding alias.
- FR-5: A parity test verifies that every `tool` named in `toolCalls` resolves to a registered `review.*` or `sr_*` tool.

## Implementation steps

1. **Contracts & Generalized Inapplicability (`packages/contracts` & `packages/core/src/evidence/`)**: Add `procedureActionTemplateSchema`, `procedureDoneDefinitionSchema`, `blockerCodeSchema`, and `inapplicabilityKindSchema`; generalize `media-absence.ts` into a table-driven inapplicability verifier over `ObservationBundle`.
2. **Curated 55-Criterion Registry Update (`packages/wcag-data`)**: Populate `tier`, `toolCalls`, and `done` across all 55 procedures in `desktop-procedures.json` (grouped by structure, media, content, visual/contrast, measurement/zoom/reflow, keyboard/focus, pointer/gestures, forms/auth, and screen-reader speech); regenerate strategy JSON artifacts.
3. **Engine & Validation Wiring (`packages/wcag-engine` & `packages/core`)**: Surface `tier`, `toolCalls`, and `done` in `showWcagCriterion` and `review.next`; validate `inapplicable` and `cantTell` transitions against the procedure's `done` definition.
4. **Generated Merged Skill & Docs (`packages/skills/a11ied` & `packages/docs`)**: Build the skill generator combining the review recipe, batch-judge packet workflow, and `N4` SR groups into `packages/skills/a11ied/SKILL.md`; convert `full-site-audit/SKILL.md` into a forwarding stub; add registry-to-tool parity tests.

## Testing

- **Completeness**: Unit test asserts 55/55 WCAG 2.2 A/AA criteria have `tier`, `toolCalls`, and `done` definitions in generated strategy files.
- **Tool Parity**: Every `tool` referenced in `toolCalls` exists in the MCP/CLI tool registry.
- **Done Validation**: Closing a check as `inapplicable` with a non-matching selector count or `cantTell` with an unknown `blockerCode` fails validation with a descriptive error.
- **Skill Freshness**: CI check verifies `packages/skills/a11ied/SKILL.md` matches the generator output with zero diff.

## Acceptance criteria

- Zero prose-only procedures; all 55 criteria carry executable templates and done definitions.
- One merged, generated `a11ied` skill (with `full-site-audit` alias stub).
- `npm run standards` and `npm test` pass.

## Sequencing

After `N1` (tier table) and `N4` (final SR verb/tool names). Blocks `N5` (`review.next` payload and skill docs).
