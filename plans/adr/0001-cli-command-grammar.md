# ADR 0001: CLI command grammar and output contract

- Status: accepted
- Date: 2026-04-07
- Related plan:
   - `plans/a11ied-cli-driver-and-execution-plan.md#CE-01`

## Context

`a11ied` is supposed to be agent-friendly and script-friendly. That falls apart fast if the CLI surface drifts while the deeper driver and verification work is still being built.

The first public milestone needs a command grammar that is plain to read and hard to misinterpret. It also needs one JSON envelope and one exit-code map that later CLI, MCP, and skill work can rely on without reverse-engineering each command family.

## Decision

Freeze these top-level command families for `v0.3.0`:

```text
a11ied wcag
a11ied inspect
a11ied drive
a11ied run
```

Keep `doctor`, `catalog`, `mcp`, and `story` as auxiliary commands, but treat the four families above as the core public runtime surface.

## Command grammar

### `a11ied wcag`

Use this family for pinned standards data only.

```text
a11ied wcag levels [--version <version>] [--json]
a11ied wcag criteria --level <level> [--version <version>] [--json]
a11ied wcag show <criterion> [--version <version>] [--json]
a11ied wcag search <query> [--limit <count>] [--version <version>] [--json]
a11ied wcag coverage <criterion> [--version <version>] [--json]
```

Rules:

- Default `--version` to `2.2`.
- Accept criterion ids like `4.1.3` and slugs like `status-messages`.
- Keep text output compact, but keep JSON output complete.

### `a11ied inspect`

Use this family for applicability planning.

```text
a11ied inspect applicable --url <url> [--version <version>] [--json]
a11ied inspect criterion <criterion> --url <url> [--version <version>] [--json]
```

Rules:

- Default `--version` to `2.2`.
- Accept `--story-id` in the grammar as a reserved future flag, but reject it at runtime in sub-plan 2 with a usage error that says Storybook targets are not available in this milestone slice.
- Keep URL targets as the only supported public target kind in sub-plan 2.

### `a11ied drive`

Use this family for low-level accessibility-driver control.

```text
a11ied drive start --target <platform> [--json]
a11ied drive status --session <id> [--json]
a11ied drive stop --session <id> [--json]
a11ied drive next [--session <id>] [--target <platform>] [--ephemeral] [--json]
a11ied drive previous [--session <id>] [--target <platform>] [--ephemeral] [--json]
a11ied drive key --keys <keys> [--session <id>] [--target <platform>] [--ephemeral] [--json]
a11ied drive type --text <text> [--session <id>] [--target <platform>] [--ephemeral] [--json]
a11ied drive interact [--session <id>] [--target <platform>] [--ephemeral] [--json]
a11ied drive stop-interacting [--session <id>] [--target <platform>] [--ephemeral] [--json]
a11ied drive click-current-item [--session <id>] [--target <platform>] [--ephemeral] [--json]
a11ied drive read [--session <id>] [--target <platform>] [--ephemeral] [--json]
a11ied drive logs [--session <id>] [--target <platform>] [--ephemeral] [--json]
a11ied drive clear-logs --session <id> [--json]
a11ied drive checkpoint --label <label> [--session <id>] [--target <platform>] [--ephemeral] [--json]
```

Rules:

- `drive start` is the only command that creates a persistent session on purpose.
- Every other action requires `--session <id>` unless `--ephemeral` is present.
- `--target` is allowed on action commands only to support `--ephemeral`.
- `virtual`, `voiceover`, and `nvda` are the only target values in this milestone.

### `a11ied run`

Use this family for repeatable execution surfaces.

```text
a11ied run axe --url <url> [--level <level>] [--criterion <criterion>] [--rule <ruleId...>] [--version <version>] [--json]
a11ied run pattern <patternId> --url <url> [--target <platform>] [--version <version>] [--json]
```

Rules:

- Keep URL targets as the only public target kind in sub-plan 2.
- Keep built-in pattern ids stable and reject unknown ids deterministically.
- Do not expose low-level browser-control commands as public CLI surface.

## JSON envelope

Every JSON-mode command must emit the same top-level envelope:

```json
{
   "ok": true,
   "command": {
      "family": "wcag",
      "subcommand": "show",
      "version": "0.1.0"
   },
   "target": null,
   "result": {},
   "warnings": [],
   "errors": [],
   "meta": {
      "schemaVersion": "1",
      "startedAt": "2026-04-07T12:00:00.000Z",
      "completedAt": "2026-04-07T12:00:00.250Z",
      "durationMs": 250
   }
}
```

Rules:

- `ok` is the coarse success flag.
- `command` records the command family, subcommand, and CLI package version.
- `target` is `null` for pure WCAG lookup and an object for target-based commands.
- `result` is command-specific and may be `null` on failure.
- `warnings` and `errors` are structured arrays, not loose strings.
- `meta.schemaVersion` is the contract version for the CLI envelope, not the package version.

## Exit codes

Freeze this map:

```text
0 success
2 usage or validation error
3 environment or dependency error
4 assertion or verification failure
5 internal runtime error
```

Rules:

- Use `2` when the user asks for something invalid, unsupported, or incomplete.
- Use `3` when the environment is missing a dependency or runtime state, like an unknown driver session or unavailable target setup.
- Use `4` when a verification or assertion ran and failed.
- Use `5` for unexpected internal failures.

## Consequences

- Later CLI work can implement handlers without renegotiating the surface.
- MCP and Agent Skill work can reuse the same envelope and error semantics.
- Help snapshots should catch accidental grammar drift before the real handler work hides it.
