# a11ied CLI ergonomics: implementation plan (v0.1.0 - 2026-04-09)

## Summary

Tighten the CLI startup path so help and other lightweight flows do not pay the cost of eagerly loading the full runtime, and add one aggregate help surface that prints the full command tree and option surface in a single shot for agent use.

## Objectives & scope

- In scope: startup-path profiling, lazy CLI loading where possible, skipping unnecessary startup work for pure help/version flows, one aggregate help command or flag, tests, manual CLI exercise, and bead tracking.
- Out of scope: changing command semantics, redesigning output envelopes, or adding new runtime capabilities beyond aggregate help output.

## Assumptions & open questions

- Assumptions: the current built CLI startup latency for `--help` is high enough to justify structural cleanup; an aggregate help command is more stable than forcing agents to recurse through help output themselves.
- Open questions: none.

## Requirements

### Functional

- FR-1: The CLI must avoid unnecessary runtime work for pure `--help` and `--version` flows.
- FR-2: The CLI must expose one aggregate help surface that prints top-level and nested help in one output.
- FR-3: The aggregate help surface must include command descriptions and flags for all shipped subcommands.
- FR-4: The repo must include a low-level markdown guide for the current CLI surface with runnable command examples.

### Non-functional

- NFR-1 (Performance): `a11ied --help` should avoid eager imports of heavy runtime modules and should complete materially faster than the current baseline.
- NFR-2 (Security): Help output must not execute any target interaction, browser work, or MCP startup side effects.
- NFR-3 (Observability): Tests must cover the aggregate help surface and the startup fast path.
- NFR-4 (Maintainability): The help tree should be generated from the real CLI grammar instead of a second hand-written catalog.

## Architecture & design overview

- Keep the CLI grammar in Commander.
- Move runtime-heavy imports behind action handlers so grammar registration stays light.
- Preflight `process.argv` in the entrypoint to skip stale-session cleanup when the invocation is pure help or version output.
- Add one aggregate help renderer that walks the built Commander tree and prints each command's help block in a stable order.

## Task grid

| Status | ID    | Task                                   | Priority | Depends On | Acceptance Criteria                                                                                                     |
| ------ | ----- | -------------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| [✓]    | EG-01 | Speed up lightweight CLI startup paths | H        | —          | Help/version flows skip unnecessary work, lazy loading is in place, manual CLI exercise is recorded, and standards pass |
| [✓]    | EG-02 | Add aggregate help output for agents   | H        | EG-01      | One command or flag prints the full help tree, tests exist, manual CLI exercise is recorded, and standards pass         |

## Task details

### EG-01 - Speed up lightweight CLI startup paths

**Goal:** Make pure help and version commands avoid startup work they do not need.

**Step-by-step instructions:**

1. Measure the current built-CLI startup cost for `a11ied --help`.
2. Identify eager imports and startup side effects that happen before any command action runs.
3. Refactor command registration so heavy runtime modules load inside action handlers instead of at process startup.
4. Preflight `process.argv` in the CLI entrypoint and skip stale-session cleanup for pure help and version flows.
5. Add or update tests that prove the help path still exposes the full shipped grammar.
6. Manually exercise the built CLI help and version flows and record the commands and observations under `specs/manual-runs/EG-01/`.
7. Run `npm run standards`.

### EG-02 - Add aggregate help output for agents

**Goal:** Give agents one stable command that prints the complete CLI help surface in a single shot.

**Step-by-step instructions:**

1. Add one aggregate help surface, either a dedicated command, a dedicated flag, or both.
2. Implement the aggregate help output by walking the real Commander tree so it stays in sync with shipped commands and options.
3. Ensure the aggregate help output includes top-level help plus nested command help for shipped subcommands.
4. Add tests that pin the aggregate help output structure and prove it includes the expected command families and option blocks.
5. Update the low-level CLI guide to include the aggregate help command.
6. Manually exercise the built aggregate help surface and record the commands and observations under `specs/manual-runs/EG-02/`.
7. Run `npm run standards`.

## New code

- `docs/cli-low-level-guide.md`: low-level CLI feature guide with runnable examples.
- `packages/cli/src/program.ts`: aggregate help surface and lighter grammar registration path.
- `packages/cli/src/cli.ts`: startup preflight so help/version flows skip unnecessary cleanup.
- `packages/cli/src/commands/*.ts`: lazy action loading where needed so help paths do not import the full runtime.
- `packages/cli/src/program.test.ts`: aggregate help and grammar regression coverage.
- `specs/manual-runs/EG-01/*` and `specs/manual-runs/EG-02/*`: manual evidence for the changed built CLI surfaces.

## Tests

- Add regression tests for the aggregate help surface.
- Add regression coverage that keeps the shipped command tree stable.
- Verify that the entrypoint fast path still preserves normal command behavior while skipping unnecessary cleanup for help/version invocations.

## Review checklist

[✓] Have all outstanding questions been answered?
[✓] Are there any ambiguities that need to resolved?
