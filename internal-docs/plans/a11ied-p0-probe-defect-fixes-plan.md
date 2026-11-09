# Probe defect fixes: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P0-3.

## Summary

Fix the defects that make probe verdicts untrustworthy before any of them are trusted: repeated full page loads in `page-facts.ts`, `foldJudgements` turning mixed inapplicable into `passed`, and heuristic passes (2.4.5 sitemap fetch, 2.5.1 class regexes) presented without a review flag.

## Objectives and scope

In scope:

- Cache page loads by URL across facts, axe, viewport, and skip-link phases; load once at 1280x900 and resize instead of navigating.
- Fix `foldJudgements` in `probe-run.ts` (worst-outcome fold; no inapplicable→passed promotion).
- Flag heuristic signals in probe rationales and findings (`heuristic: true` with the signal named).

Out of scope:

- Redesigning probe heuristics beyond removing the listed defects.
- The decisive/advisory split (P0-2), which builds on this fix.
- Unifying axe and facts onto one page (P1-11), which is the larger refactor; this plan does the load-caching subset.

## Assumptions

- `PageEvidenceCache` in `probe-site.ts` is the right cache layer; it needs to cover all phases, not just facts+axe.
- Viewport overflow measurements are comparable after resize without reload; if a page depends on load-time viewport, the probe must record that limitation.

## Requirements

### Functional

- FR-1: `collectPageFacts` performs one `goto` per URL; `readSkipLink`, `measureViewports`, and `findClippedText` reuse the loaded page.
- FR-2: `measureViewports` resizes the same page (320, 640, 800 widths) and records `devicePixelRatio`/viewport per measurement.
- FR-3: `foldJudgements` returns the worst outcome by `failed > cantTell > passed > inapplicable`, with `inapplicable` only when every state is inapplicable.
- FR-4: Probes using fetched sitemap (2.4.5) or class-name matching (2.5.1, 2.5.7) mark findings `heuristic` and never return a bare `passed` on the heuristic alone.

### Non-functional

- NFR-1: Page loads per URL drop from 6+ to 1; assert this in a test with a counting fixture server.
- NFR-2: No change to probe outcomes on the existing fixture suite except where the old outcome depended on a defect (document each delta).

## Design

- `page-facts.ts`: restructure `collectPageFacts` to: `goto` → facts script → small targets → instrumentation → tab walk → indicator probes → skip link (focus first element, no reload) → viewport resizes → text-spacing style tag. All evaluates run on the same `Page`.
- `page-layout.ts`: `measureViewports` uses `setViewportSize` only; remove the initial `goto`.
- `probe-run.ts`: rewrite `foldJudgements` per FR-3; add per-state outcome list to the rationale.
- `probe-types.ts`: extend `Judgement.finding` with optional `heuristic?: string`.

## Implementation steps

1. `page-facts.ts` + `page-layout.ts`: single-load refactor; keep `MAX_TAB_STOPS`, settle times, and scripts unchanged.
2. `probe-run.ts`: fix `foldJudgements`; update `judge.test.ts` / `probe-run.test.ts` expectations.
3. Feature probes 2.4.5, 2.5.1, 2.5.7: add heuristic flags; downgrade bare passes to advisory where the signal is absent.
4. Add a load-count test (fixture server counts GETs per URL).

## Testing

- Unit: `foldJudgements` truth table (all 4×4 outcome pairs).
- Integration: load-count assertion; probe fixture outcomes before/after with a changelog of deltas.
- Regression: `npm test`, `npm run standards`, and the browser suite (`npm run test:browser`).

## Risks

- Resize-based measurement may differ from load-based on pages that listen to resize on load only: record the limitation and keep a load-based fallback flag for those fixtures.
- Fixing `foldJudgements` may surface new failures on multi-state fixtures: expected; update fixtures with justification, do not relax the fold.

## Acceptance criteria

- One page load per URL across all fact phases.
- No mixed-inapplicable promotion.
- Heuristic passes are flagged and reviewable.
- Standards and tests pass.

## Sequencing

Independent; required before P0-2 classification is final. P1-11 supersedes the caching approach with a shared page.
