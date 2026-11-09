# Observation bundle and cache: implementation plan (2026-11-09)

Source: `internal-docs/capabilities-review-and-target-design.md` finding 4 (observation layer) and finding 8 (incrementality).

## Summary

Build one observation pass per URL/state that produces the bundle every criterion reuses, cached by fingerprint so unchanged pages are never re-observed. Replaces 6+ loads per URL (facts page, axe page, skip-link reload, three viewport reloads, per-check screenshots) with one page.

## Objectives and scope

In scope:

- `packages/core/src/observe/`: `observe(url|file|html, opts) -> ObservationBundle` (axe, tree, DOM facts, screenshots, viewport matrix, optional SR transcript).
- Content-addressed cache `cache/<fingerprint>/` under the run dir; fingerprint from tree-hash + URL + viewport set.
- ACT rule execution as tier-0 input where available.
- Single Playwright page per URL; subsumes P1-11 (single-page observation) and P1-13 (parallel loads).

Out of scope:

- Verdict scoring (N1) — this plan produces bundles only.
- Real screen reader sessions — virtual only by default; native sessions attach a transcript to the bundle (see N4).

## Requirements

- FR-1: One navigation per URL; axe/tree/facts/screenshots come from the same loaded page.
- FR-2: Cache hit returns the bundle without a browser launch; cache is reused across runs for the same fingerprint.
- FR-3: Bounded parallel loads across distinct URLs (default 4), deterministic result order.
- FR-4: Bundle records fingerprint, viewport set, build, and capture time for repro.

## Design

- `observe()` opens one instrumented page, runs axe, reads tree, collects facts, captures screenshots, resizes (not navigates) for the viewport matrix, then closes. Result is written atomically (unified persistence) to the cache path.
- `verdict engine (N1)` and `review.observe (N5)` read bundles from cache; the agent never triggers a second load for the same fingerprint.

## Testing

- Load count: exactly one navigation per URL (fixture server assertion).
- Cache: second observe of an unchanged page performs zero navigations; a changed page re-observes once.
- Axe equality: on-page axe matches standalone axe on fixtures.

## Acceptance criteria

- One navigation per URL; fingerprint-cached bundles reused across checks and runs.
- Standards and tests pass.

## Sequencing

After P1-13 (unified persistence). Blocks N1 and N5.
