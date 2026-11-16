# Performance, quality, and target-design plans index (2026-11-10, consolidated)

Index for the implementation plans responding to `internal-docs/audit-performance-quality-review.md`, `internal-docs/capabilities-review-and-target-design.md`, the concurrency review, and `a11ied-proof-5qp`.

To avoid building interim coordinator patches in `P0–P2` and then rewriting them in `N1–N6`, the incremental `P0–P2` and `13a–13c` plans are **consolidated directly into the 7 canonical execution epics below** (`P1-13` + `N1`–`N6`, with `P0-6` already landed in `a11ied-proof-9uz.4`). The standalone `P0–P2` and `13a–13c` files remain in `internal-docs/plans/` as detailed design references for their respective steps.

## Canonical execution epics (`a11ied-proof-9uz`)

1. **P0-6 — Batch claims per state (`a11ied-p0-batch-claims-plan.md`)** — **CLOSED (`a11ied-proof-9uz.4`)**
   - Claims up to `count` checks on the same state in a single lock acquisition.
2. **P1-13 — Unified file governance (`a11ied-p1-13-unified-file-governance-plan.md`)**
   - Five persistence primitives in `packages/core/src/files/store.ts` (`writeAtomic`, `withPathLock`, `withLockedFile`, `appendLine`, `withRunTransaction`, `withDirectoryCommit`), migrating ~15 raw `writeFile`/`appendFile` call sites and adding a CI grep gate.
   - **Consolidates and supersedes**:
      - `a11ied-p1-13a-artifact-atomicity-plan.md` (13a atomic artifact writes + attempt-scoped filenames)
      - `a11ied-p1-13b-lock-budget-plan.md` (13b >=10s lock retry budget + in-lock evidence validation)
      - `a11ied-p1-13c-transactional-claims-plan.md` (13c `withRunTransaction` across register + record + evaluate)
      - `a11ied-p1-single-artifact-write-plan.md` (P1-12 single artifact write in `runClaim`)
3. **N4 — Screen-reader CLI reorganisation (`a11ied-n4-sr-cli-reorganisation-plan.md`)**
   - Retains the full `a1 sr` CLI, MCP, and `queuedScreenReader` capabilities organized into 6 task groups (`session`, `navigate`, `interact`, `assert`, `inspect`, `bulk`) backed by one command registry.
   - **Consolidates and supersedes**:
      - `a11ied-p2-sr-action-registry-plan.md` (P2-15 generated MCP tools/descriptions + parity tests from the SR verb registry)
4. **N2 — Observation bundle and cache (`a11ied-n2-observation-bundle-plan.md`)**
   - Single-navigation `observe(target, opts) -> ObservationBundle` per `(URL, stateSetup)` with content-addressed `cache/<fingerprint>/`, declarative `setup: StateSetupAction[]` replay, automatic in-process **virtual screen reader** transcript + rotor summaries, computed rest/`:focus-visible`/`:hover` contrast sampling, and auto-discovered interactive state candidates.
   - **Consolidates and supersedes**:
      - `a11ied-p0-probe-defect-fixes-plan.md` (P0-3 single-load page facts, safe non-destructive mutation order, `foldJudgements` fix, heuristic flags for 2.4.5/2.5.1/2.5.7)
      - `a11ied-p1-single-page-observation-plan.md` (P1-11 single Playwright page sharing axe + tree + facts + screenshot)
      - `a11ied-p1-parallel-page-loads-plan.md` (P1-13 bounded-concurrency parallel page loads, default 4)
      - `a11ied-proof-5qp` (interactive state setup replay and per-state fingerprint cache keying)
5. **N1 — Verdict store (`a11ied-n1-verdict-store-plan.md`)**
   - Single `Verdict` schema (`tier: 0 | 1 | 2 | 3`, `verdicts.jsonl`), deterministic Tier-0/1 scoring engine with strict soundness guardrails, real criterion-specific `MeasurementRecord[]`, template-group dedupe, severity priority ordering, first-class `exclude` scope rules, and professional **Executive Summary + VPAT/ACR Conformance Table** reports.
   - **Consolidates and supersedes**:
      - `a11ied-p0-deterministic-axe-obligations-plan.md` (P0-1 deterministic scanner closure)
      - `a11ied-p0-probe-decisive-advisory-plan.md` (P0-2 decisive Tier 0/1 vs. advisory Tier 2 split with `nextAction`)
      - `a11ied-p0-template-dedupe-plan.md` (P0-4 template-group dedupe, `template_smoke`, and fingerprint revocation)
      - `a11ied-p0-severity-priority-plan.md` (P0-5 severity priority ordering and partial `pageVerdicts`)
      - `a11ied-p1-lightweight-evidence-plan.md` (P1-8 lightweight `ObservationRef[]` replacing mirrored artifact envelopes)
      - `a11ied-proof-5qp` (measurement soundness: real physical measurements replacing synthetic `0`/`1` `failing probes per page`)
6. **N3 — Procedure registry and generated skill (`a11ied-n3-procedure-registry-plan.md`)**
   - Upgrades all 55 curated WCAG 2.2 A/AA procedures with `{ tier, toolCalls, done }`, generalized table-driven `inapplicability` proofs, closed `blockerCode` vocabulary, and generates the unified `packages/skills/a11ied/SKILL.md` skill (with `full-site-audit` as a forwarding stub).
   - **Consolidates and supersedes**:
      - `a11ied-p1-executable-procedures-plan.md` (P1-7 executable `toolCalls` templates)
      - `a11ied-p2-procedure-done-definitions-plan.md` (P2-16 structured `done` definitions, blocker codes, and generalized `inapplicability` kinds)
      - `a11ied-p2-merged-skills-plan.md` (P2-14 merged `a11ied/SKILL.md` + `full-site-audit` alias stub)
7. **N5 — Review facade (`a11ied-n5-review-facade-plan.md`)**
   - Collapses `check`, `audit`, `probe`, `discover`, `tree`, and `record_result` into the 8-tool `review.*` facade (`start`, `next`, `observe`, `judge`, `status`, `report` + `wcag.show/search` + `doctor`), with a self-contained **State Review Packet** on `review.next`, batch `review.judge({ verdicts })` in one transaction, and **disjoint-state parallel subagent claiming**.
   - **Consolidates and supersedes**:
      - `a11ied-p1-actionable-status-plan.md` (P1-9 bounded actionable top-20 default status + `--full` flag)
      - `a11ied-p1-audit-entrypoints-plan.md` (P1-10 `a1 review` entry point + backwards-compatible CLI/MCP aliases)
8. **N6 — Core decomposition (`a11ied-n6-core-decomposition-plan.md`)**
   - Splits `@a11ied/core` into six single-job packages (`knowledge`, `observe`, `verdict`, `review`, `report`, `screen-reader`) with a one-release `@a11ied/core` re-export shim and a CI no-cycle check.

## Dependency & execution graph

```
P1-13 (Unified File Governance) ──┬──> N2 (Observation Bundle + State Setup + Virtual SR) ──> N1 (Verdict Store + Dedupe + Priority + VPAT) ──┐
                                  │                                                                                                            ├──> N3 (Procedure Registry + Generated Skill) ──> N5 (Review Facade + Batch Judge) ──> N6 (Core Decomposition)
N4 (SR CLI 6-Group Reorg) ────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Wave 1 (Parallel Foundation)**: `P1-13` (Unified File Governance) and `N4` (Screen-Reader CLI Reorganisation).
2. **Wave 2 (Single-Pass Observation)**: `N2` (Observation Bundle + Cache + State Setup Replay + Virtual SR + Contrast Sampler) — depends on `P1-13`; resolves the observation half of `a11ied-proof-5qp`.
3. **Wave 3 (Unified Verdicts & Reporting)**: `N1` (Verdict Store + Tier 0/1 Engine + Template Dedupe + Severity Priority + Scope Exclusions + VPAT/Executive Summary) — depends on `N2` and `P1-13`; resolves the measurement/scoring half of `a11ied-proof-5qp`.
4. **Wave 4 (Executable Knowledge & Skill)**: `N3` (Procedure Registry + Done Definitions + Generated `a11ied` Skill) — depends on `N1` and `N4`.
5. **Wave 5 (Unified Agent Loop)**: `N5` (Review Facade + State Review Packet + Batch `review.judge` + Disjoint-State Multi-Agent Claims) — depends on `N1`, `N2`, `N3`, `N4`.
6. **Wave 6 (Package Boundary Split)**: `N6` (Core Decomposition into 6 packages) — depends on `N5`.
