# Observation bundle and cache: implementation plan (2026-11-10, consolidated)

Current implementation boundary (November 11 recovery): this historical target design is
not evidence of completed capabilities or a conformance assessment. Use
[`automated-rule-boundaries.md`](../automated-rule-boundaries.md), the maintained N5
facade plan, and the shipped `a11ied` skill for verified behavior. Non-axe probe
observations remain unresolved; missing facts do not prove absence. Collector receipts
bind captures but do not establish complete procedure execution. Native, site and journey
claims require their supported reader/coordinator evidence. Template members are assessed
independently. Validation results and source hashes are in
[`review-recovery.json`](../validation/review-recovery.json).

Source: `internal-docs/capabilities-review-and-target-design.md` findings 4 & 8 and `internal-docs/audit-performance-quality-review.md`.
Consolidates and supersedes:

- `a11ied-p0-probe-defect-fixes-plan.md` (P0-3 single-load page facts, `foldJudgements` fix, heuristic flags for 2.4.5/2.5.1/2.5.7)
- `a11ied-p1-single-page-observation-plan.md` (P1-11 single-page observation sharing facts + axe + tree + screenshot)
- `a11ied-p1-parallel-page-loads-plan.md` (P1-13 bounded-concurrency parallel page loads)
- `a11ied-proof-5qp` (interactive state setup replay and per-state cache keying so interactive states never reuse initial-page facts)

## Summary

Build one observation pass per `(URL, stateSetup)` that produces the complete `ObservationBundle` every criterion reuses, cached by content fingerprint (`cache/<fingerprint>/`) so unchanged states are never re-observed. Replaces 6+ reloads per URL with one instrumented page load, replays declarative interactive state setup steps (`click`, `press`, `type`, `hover`, `focus`, `wait`) before observation, captures computed non-text and `:focus-visible`/`:hover` contrast ratios, and runs the in-process virtual screen reader walk + rotor summaries automatically.

## Objectives and scope

In scope:

- `packages/core/src/observe/`:
   - `observe(target: url | file | html, opts) -> ObservationBundle` containing:
      - `axe`: on-page `axe-core` scan + ACT rule results.
      - `tree`: accessibility tree snapshot + structural hash.
      - `facts`: single-load DOM/layout/interaction facts (`page-facts.ts` + `page-layout.ts`), including heuristic applicability flags (`hasSiteNavigation`, `hasMultipointGesture`, `hasDraggable`) for 2.4.5, 2.5.1, 2.5.7 (P0-3).
      - `contrast`: computed foreground, background, outline, and border colors + contrast ratios across rest, `:focus-visible`, and `:hover` states (including active CSS transition sampling for 1.4.3 / 1.4.11 / 2.4.7 / 1.4.13).
      - `viewports`: reflow and text-spacing matrix (`1280×900`, `320×256`, `1280×1024 @ 200%` via CDP device metrics without resetting viewport, `800×1280` portrait, and 1.4.12 text-spacing override with cleanup).
      - `screenshots`: initial/state full-page screenshot + cropped element screenshots for flagged interactive/contrast targets.
      - `transcript`: automatic in-process **virtual screen reader** transcript (`virtual-dom` provenance: reading-order walk + rotor summaries for headings, landmarks, links, form controls, and live regions), plus optional attached native `voiceover`/`nvda` transcript when escalated.
      - `interactiveCandidates`: auto-discovered interactive state triggers (`[aria-expanded="false"]`, `<dialog>`, `[role="dialog"]`, `[role="tab"]`, `<form>`) on representative pages so the review harness can automatically queue high-value interactive states.
- Declarative state setup replay (`a11ied-proof-5qp`):
   - `opts.setup?: StateSetupAction[]` (`click`, `press`, `fill`, `hover`, `focus`, `waitForSelector`) executes deterministically after navigation and before any fact/axe/tree/screenshot/SR capture, recording an `actionTrace` with real monotonic timestamps.
- Content-addressed cache (`cache/<fingerprint>/`):
   - Keyed by `sha256(tree-hash + canonicalUrl + canonical(setup) + viewportSet)` so an expanded menu drawer, open modal, or form-error state never collides with the initial page's cached bundle (`a11ied-proof-5qp`).
   - Written atomically via `P1-13` (`writeAtomic` / `withDirectoryCommit`).
- Bounded-concurrency parallel observation (`P1-13`):
   - `observeAll(targets, { concurrency = 4 })` runs up to 4 isolated browser contexts/pages in parallel with deterministic output ordering.

Out of scope:

- Verdict scoring (`N1`) — `observe()` produces `ObservationBundle` data only.

## Requirements

- FR-1: Exactly one `page.goto()` navigation per `(URL, stateSetup)` observation; all facts, axe, tree, screenshots, virtual SR walk, and viewport resizes happen on that single loaded page in a non-destructive sequence.
- FR-2: Safe mutation order on the single loaded page:
   1. `page.goto()` + execute `opts.setup` (recording `actionTrace`).
   2. Read initial DOM snapshot, accessibility tree, and run in-process virtual SR walk + rotor summaries.
   3. Run on-page `axe-core` scan and capture baseline `1280×900` screenshot (before any focus, scroll, or style injection mutates the page).
   4. Measure small targets, install event/mutation instrumentation, walk tab stops, and sample computed rest / `:focus-visible` / `:hover` contrast & focus-indicator styles (keyed by unique element index/selector, never splitting on `:` in text).
   5. Reset focus to `document.body` (without reloading) and test first-Tab skip-link activation.
   6. Resize viewports (`320×256`, `1280×1024`, `800×1280`) for reflow/orientation, then restore `1280×900`.
   7. Inject 1.4.12 text-spacing `<style>` override, measure clipped text, and remove the `<style>` tag.
- FR-3: Cache hit returns the stored `ObservationBundle` with zero browser launches; interactive states with distinct `setup` steps produce distinct cache fingerprints (`a11ied-proof-5qp`).
- FR-4: Bounded parallel observation across distinct `(URL, setup)` targets defaults to concurrency 4 (`--concurrency` flag / `concurrency` option) and preserves input order.

## Implementation steps

1. **Schemas & Cache Layout (`packages/contracts` & `packages/core/src/observe/cache.ts`)**: Define `ObservationBundle`, `StateSetupAction`, `ContrastSample`, `InteractiveCandidate`, and content-addressed `cache/<fingerprint>/` read/write using `P1-13` `writeAtomic`.
2. **Single-Page Non-Destructive Collector & State Setup Replay (`packages/core/src/observe/collector.ts`)**: Combine `page-facts.ts`, `page-layout.ts`, `axe/scan.ts`, `tree`, and screenshot capture into one single-navigation collector with `setup?: StateSetupAction[]` replay and safe mutation ordering (P0-3, P1-11, `a11ied-proof-5qp`).
3. **Computed Contrast & Focus/Hover Style Sampler (`packages/core/src/observe/contrast-sampler.ts`)**: Fix `focusChangesStyle` element lookup (index/selector reference instead of `id.split(':')`), check `outlineColor`/`borderColor`/`:focus-within`, and sample computed rest, `:focus-visible`, and `:hover` contrast ratios (including transition frames) for 1.4.3, 1.4.11, 1.4.13, and 2.4.7.
4. **Automatic Virtual SR Transcript & Interactive Candidate Discovery (`packages/core/src/observe/virtual-sr.ts`)**: Run the in-process virtual screen reader walk + rotor summaries (`headings`, `landmarks`, `links`, `formControls`) on every observed state, and detect interactive state candidates (`aria-expanded`, dialogs, tabs, forms).
5. **Bounded Parallel Runner (`packages/core/src/observe/parallel.ts`)**: Implement `mapWithConcurrency` (default 4) across `(URL, setup)` targets and wire `--concurrency` into CLI/MCP (`P1-13`).

## Testing

- **Single-Load Assertion**: Fixture HTTP server counts `GET` requests per state; `observe()` triggers `1` request on cold cache and `0` on warm cache.
- **Interactive State Isolation (`5qp`)**: Observing `(url, setup: [])` vs. `(url, setup: [{ action: 'click', selector: '#menu-toggle' }])` produces two distinct fingerprints and captures the expanded menu DOM/focus targets rather than reusing initial-page facts.
- **Mutation Hygiene**: On-page `axe-core` and baseline screenshot match standalone un-instrumented `axe-core` and screenshot on the same fixture; viewport is restored to `1280×900` and injected 1.4.12 `<style>` is removed after collection.
- **Contrast & Virtual SR**: Hover/focus transition contrast drop (e.g., 150ms hover transition) and virtual SR heading/landmark/control summaries are captured in the bundle.
- **Parallel Concurrency**: 10-page fixture with `concurrency: 4` never exceeds 4 active page loads and returns results in deterministic order.

## Acceptance criteria

- One navigation per `(URL, stateSetup)` target; zero cross-state cache pollution.
- Every bundle includes axe, tree, DOM facts, viewport matrix, computed focus/hover contrast samples, screenshots, and virtual SR transcript.
- `npm run standards` and `npm test` pass.

## Sequencing

After `P1-13` (unified persistence). Blocks `N1` (verdict store) and `N5` (review facade).
