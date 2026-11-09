# Review facade (thin CLI/MCP/TS over verdicts): implementation plan (2026-11-09)

Source: `internal-docs/capabilities-review-and-target-design.md` finding 7 (interface multiplication).

## Summary

Collapse the three parallel stacks (single-page `audit`, coordinator `audit run/next/...`, evidence `record_result`) into one `review.*` facade backed by the verdict store (N1) and observation bundles (N2). CLI, MCP, and TS imports become thin adapters over one operation registry; the 24 MCP tools shrink to 8.

## Objectives and scope

In scope:

- `packages/core/src/review/`: `start, next, observe, judge, status, report` (+ `wcag.show/search`, `doctor` passthrough).
- MCP: replace `audit`, `audit_assessment`, `audit_probe`, `record_result`, `list_pending_results`, `run_axe`, `tree`, `sr_session`/`sr_action`/`sr_transcript` review-facing tools with the 8-tool facade (SR verbs remain available via N4's generated `sr_*` tools for interactive use).
- CLI: `a1 review <verb>` as the AA-review entry; existing `audit`/`axe`/`tree` remain as aliases during migration.
- TS: `a11ied` exports `review` only (scanner/tree/coordinator functions collapse behind it); `a11ied/test` + `a11ied/vitest` stay for SR testing (N4).

Out of scope:

- Verdict scoring (N1) and observation internals (N2).
- Removing SR CLI verbs (N4).

## Requirements

- FR-1: `review.start` returns run ID + per-criterion plan (tier, templates, order) + first action.
- FR-2: `review.next` claims one (or one batch per state, P0-6) and returns executable templates (N3).
- FR-3: `review.observe` returns the cached bundle or a named slice (axe/tree/facts/transcript).
- FR-4: `review.judge` stores the verdict in one call; `review.status` returns actionable top-20 + coverage + per-page verdicts; `review.report` publishes the bundle.
- FR-5: CLI/MCP/TS parity: one registry, generated help and schemas; parity test covers the 8 tools.

## Design

- `core/src/review/` holds state (verdict store + cache handle) and delegates deterministic scoring to N1, observation to N2, SR steps to the N4 registry, and persistence to the unified layer (P1-13). Adapters (`packages/cli`, `packages/mcp-server`, `packages/cli/src/test`) are ~50-line registrations.
- Old `audit*` command implementations become adapters that call `review.*` (or import the same core functions) during migration, then are removed.

## Implementation steps

1. `core/src/review/` on top of N1+N2; unit tests per verb.
2. MCP facade with parity test; old tools forward to facade.
3. CLI `review` command tree; `audit` aliases registered.
4. TS exports trimmed to `review`; docs + skill updated from the registry.

## Testing

- Parity: same input on CLI/MCP/TS yields the same structured result.
- End-to-end: fresh site reviewed to completion using only the 8 tools.
- Regression: old `audit` aliases produce identical output during migration.

## Acceptance criteria

- Review needs only the 8 tools (interactive SR work uses N4's tools).
- One registry drives help, schemas, and descriptions.
- Standards and tests pass.

## Sequencing

After N1, N2, N3, N4. Takes over where P1-10 (entry points) left off.
