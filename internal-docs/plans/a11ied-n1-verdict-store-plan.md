# Verdict store: implementation plan (2026-11-09)

Source: `internal-docs/capabilities-review-and-target-design.md` findings 1–2.

## Summary

Replace three unrelated verdict shapes (`AxeVerdict`, probe `Judgement`, `AssessmentCheck`/`EvidenceRecord`) with one `Verdict` per criterion per state. All engines — axe, DOM facts, probes, agent judgments — write the same object. Coverage becomes a count of verdicts, never a separate assertion.

## Objectives and scope

In scope:

- `packages/contracts`: `verdictSchema` (`{ criterionId, stateId, tier 0..3, outcome, confidence, method, evidence, repro, nextAction? }`).
- Deterministic engine (`packages/core/src/verdict/`): tier-0/1 scoring from axe + DOM + tree + probe facts, writing verdicts with no agent.
- Coordinator read path: pre-closed verdicts are honoured; only tier-2/3 remain claimable.
- Migration: `run.json` checks and `evidence.jsonl` records translate to verdicts; old files remain readable.

Out of scope:

- Procedure `toolCalls` content (N3).
- Observation collection internals (N2) — the engine consumes a bundle, whoever builds it.

## Requirements

- FR-1: One `Verdict` per `(criterionId, stateId, procedureId)`; re-scoring the same bundle is idempotent (same verdict ID).
- FR-2: `confidence: 1.0` only for tier-0 rules with ACT/axe backing; all other passes carry `< 1.0` with the limiting factor named.
- FR-3: Tier-0/1 verdicts close their checks without agent steps (builds on P0-1).
- FR-4: `cantTell` requires `nextAction` naming the missing capability/authorization (done-definitions vocabulary).

## Design

- Schema in `packages/contracts/src/schemas/verdict.ts`; store as `verdicts.jsonl` in the run dir, behind the unified persistence layer (P1-13).
- Engine functions are pure `(bundle, criterion) -> Verdict`; probe functions become tier-0/1 verdict functions inside the engine, deleting `probe-run.ts` as a separate recorder.
- Report builder reads verdicts directly; `criteria-rollup` is deleted.

## Testing

- Idempotence: scoring the same bundle twice yields one verdict.
- Tier table: each of the 55 A/AA criteria has a declared tier; tier-0 passes reproduce from the bundle alone.
- Migration: a saved run pre-loads as equivalent coverage.

## Acceptance criteria

- One verdict shape; no `AxeVerdict`/`Judgement`/`AssessmentCheck` triplication for the same outcome.
- Tier-0/1 criteria close with zero agent calls.
- Standards and tests pass.

## Sequencing

Depends on N2 (bundle) for inputs. Blocks N5 (review facade), which reads the store.
