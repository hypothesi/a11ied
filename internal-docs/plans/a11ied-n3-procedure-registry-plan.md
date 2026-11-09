# Procedure registry and generated skill: implementation plan (2026-11-09)

Source: `internal-docs/capabilities-review-and-target-design.md` finding 6 (inert knowledge), builds on P1-7 and P2-16.

## Summary

Rewrite the 55 curated procedures from prose into a registry the engine and the agent both execute: per criterion `{ tier, toolCalls: [{ tool, input, expect }], failureObjects, doneDefinitions }`. Generate the merged skill, `review.next` payloads, and `wcag show` output from the registry — no hand-written 600-line contract.

## Objectives and scope

In scope:

- `packages/wcag-data/data/curated/desktop-procedures.json` + `test-methods/procedures.ts`: `seedSchema` gains `tier`, `toolCalls`, `done`.
- `wcag-engine`: exposes the registry; `showWcagCriterion` returns templates.
- `packages/skills`: skill body generated from the registry (recipe shell + per-tier call tables).
- Validation (optional): record checks that the named tool exists in the registry-parity test.

Out of scope:

- Tier assignment itself (N1 declares tiers; the registry stores them).
- Auto-executing templates — the agent still runs them.

## Requirements

- FR-1: Every A/AA criterion has tier + ≥1 `toolCall` (or an explicit `humanOnly` with reason).
- FR-2: `review.next` returns the templates verbatim; no procedure is returnable without them.
- FR-3: Skill text is generated; editing the registry changes the skill with no second edit.
- FR-4: Each template names a tool registered in the CLI/MCP registry (parity test).

## Design

- One `toolCalls` field on the seed; generation emits `strategy.2.2.json` with templates. The MCP `review.observe` tool accepts the same input names, so templates are machine-runnable.
- The skill is a thin shell (goals, safety, recipes) + generated per-tier tables. The hand-written evidence chapter is deleted (verdict store replaces envelopes).

## Testing

- Registry completeness: 55/55 criteria have tier + templates (unit test over generated artifacts).
- Parity: every template tool resolves to a registered MCP/CLI tool.
- Manual: an agent given only the generated skill completes 5 criteria across tiers.

## Acceptance criteria

- Prose-only procedures number zero.
- Skill edits flow from the registry.
- Standards and tests pass.

## Sequencing

After N1 (tiers) and N4 (final SR tool names). Blocks N5.
