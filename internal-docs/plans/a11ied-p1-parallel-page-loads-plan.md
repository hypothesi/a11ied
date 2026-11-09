# Parallel page loads: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P1-13.

## Summary

Parallelize independent page loads across distinct URLs with bounded concurrency. `observeInventoryPages` and `buildSiteFacts` are sequential loops; page loads do not depend on each other. Keep the serial queue only for the shared run file.

## Objectives and scope

In scope:

- Bounded-concurrency loads (default 4, configurable) in `observeInventoryPages` (`probe-observe.ts`) and `buildSiteFacts` / `PageEvidenceCache` (`probe-site.ts`).
- Concurrency-safe browser/context creation (Playwright contexts are independent; the run file writes stay serialized).
- Progress reporting under concurrency.

Out of scope:

- Parallel check claiming (P0-6 batches claims but keeps serial judging).
- Changing the coordinator queue.

## Assumptions

- Target sites tolerate 4 concurrent headless pages; 4 is a ceiling, not a target.
- Run-file writes via `updateAuditRun` already serialize through the file lock.

## Requirements

### Functional

- FR-1: `observeInventoryPages` and `buildSiteFacts` accept `concurrency` (default 4) and load pages with that bound.
- FR-2: Results are deterministic regardless of completion order (sorted by URL).
- FR-3: A single failing page does not abort the others; failures are recorded as missing states with the error.
- FR-4: `onProgress` fires per completed page.

### Non-functional

- NFR-1: 24-page fixture load time improves measurably; record before/after in the PR (expect ~2–4× on CPU-bound pages).
- NFR-2: Memory stays bounded (4 contexts + pages max); no new long-lived state.

## Design

- Add a small `mapWithConcurrency(items, limit, fn)` helper in `probe-site.ts` (no new dependency).
- `observeInventoryPages`: replace the sequential `for` loop with the helper; state registration stays sequential through `executeAuditAssessment` (file lock already serializes).
- `buildSiteFacts`: `Promise.all(urls.map(cache.get))` already parallel; bound it with the same helper.
- CLI/MCP: `audit probe --concurrency <n>` flag and `audit_probe` schema field.

## Implementation steps

1. Helper + `probe-observe.ts` wiring.
2. `probe-site.ts` bounded `buildSiteFacts`.
3. CLI/MCP flag; default 4.
4. Timing test on a 10-page fixture (assert completion within a generous bound; do not assert exact speedup in CI).

## Testing

- Unit: helper respects the bound (max in-flight counter) and preserves order.
- Integration: fixture with one failing URL; others complete.
- Regression: sequential `concurrency: 1` matches previous behavior.

## Risks

- Rate-limiting by target sites: mitigate with the configurable bound and a failure path that never blocks other pages.
- Flaky CI under load: keep the bound low and timeouts unchanged.

## Acceptance criteria

- Parallel load with deterministic results.
- Measured speedup documented.
- Standards and tests pass.

## Sequencing

Depends on P1-11 (single page per URL) so the concurrency bound counts pages, not contexts. Independent of coordinator work.
