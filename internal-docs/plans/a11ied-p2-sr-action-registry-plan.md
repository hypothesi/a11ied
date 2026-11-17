# Screen reader tool registry (sr_action): implementation plan (2026-11-09)

Source recommendation: the November 2026 audit performance review (removed; see git history), item P2-15. Updated 2026-11-09: the SR CLI is retained (see `a11ied-n4-sr-cli-reorganisation-plan.md`); this plan is its registry mechanism, not a removal plan.

## Summary

Stop hand-writing the `sr_action` prose description. Generate it from the same command registry the CLI uses, or split the mega-tool into `sr_navigate`, `sr_act`, `sr_assert`. Whichever option is chosen, the MCP description and the CLI help cannot drift. The SR CLI (human + agent) is retained and better organised — see N4 for the six command groups; this plan is the shared registry underneath those groups.

## Objectives and scope

In scope:

- The SR MCP tool(s) in `packages/mcp-server/src/tools/sr-action.ts`, `sr-list.ts`, `sr-session.ts`, `sr-transcript.ts`.
- The CLI SR command registry (`packages/cli/src/commands/drive*.ts`).
- Registry-parity tests between CLI help and MCP descriptions.

Out of scope:

- Adding new SR verbs.
- Changing session semantics (single active session stays).
- Removing or demoting the SR CLI. The CLI remains the primary human/agent surface; MCP and the queued TS API are generated adapters over the same verbs (N4).

## Assumptions

- The CLI is the source of truth for verb names and payload shapes (per `cli-purpose-audit.md` Part 5, the CLI has per-verb help).
- Agents program against tool names, not descriptions; a split is a surface change that needs a parity test, not a behavior change.

## Requirements

### Functional

- FR-1: Option A (generate): `SR_ACTION_DESCRIPTION` is built from the registry at server startup; editing a CLI verb updates the MCP description with no second edit.
- FR-2: Option B (split): three tools exist — `sr_navigate` (next/previous/goto/top/bottom/elements/read-all), `sr_act` (press/type/activate/interact/focus/perform), `sr_assert` (expect/wait/checkpoint/transcript) — each with a short description; `sr_action` remains as a forwarding alias for one release.
- FR-3: A registry-parity test asserts every CLI SR verb appears in the MCP descriptions (and vice versa).

### Non-functional

- NFR-1: Tool count and `tools/list` payload stay bounded (split adds 2 tools; generation adds none).
- NFR-2: No description longer than 800 characters per tool.

## Design

- Option A: extract verb metadata (`{ verb, payloadSchema, summary }`) into `packages/core` or a shared module consumed by both `packages/cli` and `packages/mcp-server`. `createMcpServer()` builds the description from it.
- Option B: define the three tools in `sr-action.ts` with per-group descriptions generated from the same metadata (combines A and B).

## Implementation steps

1. Extract verb metadata from the CLI drive commands.
2. Generate the MCP description(s) from it (start with Option A; split in the same PR if the description still exceeds the budget).
3. Extend `registry-parity.test.ts` with an SR-verb completeness assertion.
4. Update the `a11ied` skill MCP table.

## Testing

- Parity test fails if a verb exists in one surface but not the other.
- Snapshot of the generated description (reviewable diff on every verb change).
- Manual: fresh MCP session lists tools; an agent navigates and asserts using only the descriptions.

## Risks

- Generated prose may be less readable than hand text: mitigate with per-verb `summary` fields kept in the registry.
- Splitting breaks existing agent configs naming `sr_action`: keep the alias.

## Acceptance criteria

- Drift is impossible (generated) or tested (split).
- Descriptions under budget; parity green.

## Sequencing

Independent. Do before P2-14 (merged skills) so the skill table uses final tool names.
