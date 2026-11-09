# Performance and quality plans index (2026-11-09, concurrency update)

Index for the 16 implementation plans responding to `internal-docs/audit-performance-quality-review.md`, plus the unified concurrency refactoring. Each plan is independently shippable; together they move the product from 1,297 provable obligations to a fast programmatic verdict with agent judgment only where the program cannot decide.

## Concurrency (unified refactoring — read first for all file-write work)

- Unified file governance (parent, supersedes 13a–c): `a11ied-p1-13-unified-file-governance-plan.md`
- 13a artifact atomicity (detail of Phase 2): `a11ied-p1-13a-artifact-atomicity-plan.md` — superseded by the unified plan
- 13b lock budget (detail of Phase 3): `a11ied-p1-13b-lock-budget-plan.md` — superseded by the unified plan
- 13c transactional claims (detail of Phase 3): `a11ied-p1-13c-transactional-claims-plan.md` — superseded by the unified plan

## P0 — make the programmatic lane real, and make probes earn it

- P0-1 deterministic scanner obligations: `a11ied-p0-deterministic-axe-obligations-plan.md`
- P0-2 decisive vs advisory probes: `a11ied-p0-probe-decisive-advisory-plan.md`
- P0-3 probe defect fixes: `a11ied-p0-probe-defect-fixes-plan.md`

## P0 — cut the obligation math

- P0-4 template-group dedupe: `a11ied-p0-template-dedupe-plan.md`
- P0-5 severity priority and early verdicts: `a11ied-p0-severity-priority-plan.md`
- P0-6 batch claims per state: `a11ied-p0-batch-claims-plan.md`

## P1 — make each check executable and cheap to prove

- P1-7 executable procedure actions: `a11ied-p1-executable-procedures-plan.md`
- P1-8 lightweight evidence: `a11ied-p1-lightweight-evidence-plan.md`
- P1-9 actionable status: `a11ied-p1-actionable-status-plan.md`
- P1-10 audit entry points: `a11ied-p1-audit-entrypoints-plan.md`

## P1 — fix measurement and observation quality

- P1-11 single-page observation: `a11ied-p1-single-page-observation-plan.md`
- P1-12 single artifact write: `a11ied-p1-single-artifact-write-plan.md`
- P1-13 parallel page loads: `a11ied-p1-parallel-page-loads-plan.md`

## P2 — reduce skill and MCP surface

- P2-14 merged skills: `a11ied-p2-merged-skills-plan.md` (documents the retained SR CLI groups)
- P2-15 screen reader tool registry: `a11ied-p2-sr-action-registry-plan.md` (generated MCP from CLI registry; SR CLI retained, N4)
- P2-16 procedure done definitions: `a11ied-p2-procedure-done-definitions-plan.md`

## Target design (capabilities review — nothing sacred)

From `internal-docs/capabilities-review-and-target-design.md`. The retained SR CLI (N4) is the one clarification applied across all of these:

- N1 verdict store (one `Verdict` shape; tier-0/1 close without an agent): `a11ied-n1-verdict-store-plan.md`
- N2 observation bundle + cache (one pass per URL, fingerprint-cached): `a11ied-n2-observation-bundle-plan.md`
- N3 procedure registry + generated skill (tier + `toolCalls` per criterion): `a11ied-n3-procedure-registry-plan.md`
- N4 screen-reader CLI reorganisation — retained for humans and agents, better organised: `a11ied-n4-sr-cli-reorganisation-plan.md`
- N5 review facade (thin CLI/MCP/TS over verdicts; 8 MCP tools): `a11ied-n5-review-facade-plan.md`
- N6 core decomposition (god-package split into six single-job packages): `a11ied-n6-core-decomposition-plan.md`

## Suggested order

1. P0-3, P0-1 (probe honesty, scanner closure).
2. P1-11, P1-12, P0-2 (single page, single write, probe split).
3. P0-4, P0-5, P0-6 (dedupe, priority, batching).
4. P1-7, P1-8, P2-16 (templates, evidence, done definitions).
5. P1-9, P1-10, P1-13, P2-14, P2-15 (status, names, parallelism, skills, registry).
6. Target design: N4 (SR CLI groups, first — templates/skills/facade depend on it) → N2 (observation bundle) → N1 (verdict store) → N3 (registry) → N5 (review facade) → N6 (core split).
