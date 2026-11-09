# Single-page observation (facts + axe + tree + screenshot): implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P1-11.

## Summary

Unify facts, axe, tree, and screenshots on one instrumented Playwright page per URL. Today the probe path loads the page for facts, launches a second page for axe, and opens a third context per screenshot. Sharing one page removes redundant loads and guarantees facts, axe, and tree describe the same DOM.

## Objectives and scope

In scope:

- `probe-site.ts` `PageEvidenceCache`: one `openProbePage` per URL shared by facts, axe, tree, and screenshots.
- `axe/scan.ts`: accept an already-loaded page (no second `goto`).
- `tree` collection from the same page (`ariaSnapshot`).
- Screenshot capture from the same page; cache per state for all checks on that state.

Out of scope:

- Changing probe heuristics (P0-3) or the decisive/advisory split (P0-2).
- Parallelism across URLs (P1-13).

## Assumptions

- Axe injection (`page.evaluate(axeScriptSource)`) is safe on an instrumented page; the instrumentation script does not alter axe results.
- Viewport-sensitive facts still resize the same page (per P0-3).

## Requirements

### Functional

- FR-1: One `BrowserContext` + one `Page` per URL covers facts, axe, tree, and screenshots.
- FR-2: Axe results record the same `url`, viewport, and build as the facts from that page.
- FR-3: Screenshots are captured once per state and reused for every screenshot-requiring check on that state.
- FR-4: Cache invalidation occurs on state revision change (existing fingerprint logic).

### Non-functional

- NFR-1: Total browser pages per site equals the number of distinct URLs (was 3× plus per-check contexts).
- NFR-2: Instrumented-page axe results match standalone axe results on the fixture suite (assert equality).

## Design

- `probe-site.ts`: `load(url)` opens the page once, runs `collectPageFacts`, `runAxeOnPage`, tree, screenshot, then returns `{ facts, axe, tree, screenshot }`. The context closes after all phases.
- `axe/scan.ts`: split `executeAxeScan` into `runAxeOnPage(page, ruleIds)` (no navigation) and the existing loaded-page wrapper.
- `tree/runtime.ts`: same-page `getAccessibilityTree` variant.
- `probe-run.ts`: `captureScreenshot` reads from the cache instead of opening a context.

## Implementation steps

1. `axe/scan.ts`: extract on-page runner.
2. `probe-site.ts`: single-page load orchestration.
3. `probe-run.ts` / `probe-artifacts.ts`: reuse cached screenshot.
4. Fixture equality test (axe on instrumented vs standalone page).

## Testing

- Unit: cache returns one page per URL; second `get` returns the same evidence.
- Integration: fixture suite axe equality; screenshot reuse across two checks on one state.
- Regression: `npm test`, browser suite, `npm run standards`.

## Risks

- Instrumentation side effects on axe: mitigate with the equality test and documentation.
- Long-lived pages accumulate listeners: close the context after the URL's checks complete (already the pattern).

## Acceptance criteria

- One page per URL; no per-check browser contexts.
- Axe output unchanged on fixtures.
- Standards and tests pass.

## Sequencing

Depends on P0-3 (single-load facts) and P0-1 (per-state axe). Must land before P1-13 (parallel loads) measures its benefit.
