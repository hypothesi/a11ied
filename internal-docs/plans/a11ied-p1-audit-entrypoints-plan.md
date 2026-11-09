# Audit entry points: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P1-10.

## Summary

Consolidate the three `audit` entry points so each name means one job: `a1 check <target>` for the single-page dev loop, `a1 audit run/next/...` for the site coordinator, and `a1 audit probe` for the probe runner with an explicit advisory label until P0-1 lands.

## Objectives and scope

In scope:

- CLI: add `a1 check` (alias or rename of `a1 audit <target>`); keep `a1 audit <target>` working with a deprecation-free notice during migration (no `@deprecated` annotation; state the preferred name in output).
- MCP: add `check` tool mirroring the single-page audit; keep `audit` tool as an alias.
- Help text, `nextCommands`, and skills updated to one name per job.
- Docs site (`packages/docs`) command pages.

Out of scope:

- Removing any command.
- Changing scan behavior or verdicts.

## Assumptions

- The single-page scan is the existing `audit` action handler (`audit-actions.ts`); renaming is a registration change, not a rewrite.
- External CI scripts may call `a1 audit`; the alias must keep its exit codes (4 on violation) and JSON shape.

## Requirements

### Functional

- FR-1: `a1 check <target>` and `a1 audit <target>` produce identical output, exit codes, and `nextCommands` for the single-page scan.
- FR-2: `nextCommands` from `check` name the coordinator (`audit run`) and the screen reader (`sr walk`), not another `audit`.
- FR-3: `audit probe` help states that its verdicts are advisory until deterministic obligations (P0-1) are enabled; the MCP `audit_probe` description matches.
- FR-4: Both skills use `check` for the dev loop and `audit run` for the site audit; no skill tells the agent to run `audit probe` for production coverage.

### Non-functional

- NFR-1: `help-all` lists each command once with one job description.
- NFR-2: CLI/MCP registry parity test covers the new `check` tool.

## Design

- CLI (`packages/cli/src/commands/audit.ts` + new `check.ts`): register the same action builder under both names; `helpGroup` updated.
- MCP (`packages/mcp-server/src/tools/execution.ts`): register `check` with the same handler as `audit`; keep `audit` registered.
- `next-commands.ts` (core): update command strings to `check` for the scan step.
- Skills: edit the "dev loop" and "assessment loop" sections.

## Implementation steps

1. CLI rename/alias + help text.
2. MCP alias + parity test.
3. `nextCommands` updates.
4. Skills + docs + README examples.
5. `cli-purpose-audit.md` update (command table).

## Testing

- CLI: `a1 check` vs `a1 audit` byte-identical JSON on a fixture; exit codes match.
- MCP: `check` vs `audit` structured content identical.
- Registry parity: `help-all` command count unchanged (one addition, alias documented).

## Risks

- Users with scripts on `a1 audit` may be confused by two names: mitigate by keeping both working and printing the preferred name once (verbose only).

## Acceptance criteria

- One name per job in help, skills, and `nextCommands`.
- Both names keep working with no behavior change.
- Standards and tests pass.

## Surrounding surface (retained, better organised)

The entry-point consolidation above covers `check`/`audit run`/`audit probe`. The screen-reader surface is consolidated separately and retained for humans and agents (N4 + P2-15):

- `a1 sr` keeps every verb, reorganised into six help groups (session, navigate, interact, assert, inspect, bulk), all scriptable with `--json` and exit codes 0/4/3.
- MCP `sr_*` tools and the `queuedScreenReader` TS API are generated from the same verb registry (P2-15), not hand-written.
- The merged skill (P2-14) documents both the interactive and scripted recipes.

## Sequencing

Independent. Do before P1-7 (templates name the tools) so templates use final names. Coordinate with N4 (SR CLI groups) so `check`/`audit run` help, SR help, and the skill use consistent group naming.
