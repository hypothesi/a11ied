# [a11lied CLI, driver, and execution]: Implementation Plan (v0.3.0 – 2026-04-06)

## Summary

Build the public runtime surface that agents and humans actually use. This sub-plan defines the CLI contract for `wcag`, `inspect`, `drive`, and `run`, then implements low-level accessibility-driver sessions plus higher-level execution patterns on top of Guidepup and axe-core.

## Objectives & Scope

- In scope: CLI command grammar, JSON output contracts, low-level driver sessions, `drive` commands, `run` commands, and reusable Guidepup-backed patterns.
- In scope: wiring `wcag` and `inspect` commands to the stable WCAG engine APIs from sub-plan 1.
- In scope: target adapters for `virtual`, `voiceover`, and `nvda`.
- In scope: tying each testable CLI, driver, and execution row to `specs/gherkin/04-08` with both automated tests and AI-agent manual runs.
- Out of scope: criterion-level verdict logic, level aggregation, Storybook bridge, MCP tools, docs expansion, and release workflow hardening.

## Assumptions & Open Questions

- Assumptions:
- `packages/wcag-engine` already provides stable lookup, search, coverage, and applicability APIs.
- Guidepup remains the right low-level foundation for VoiceOver, NVDA, and virtual screen-reader work.
- The CLI should default to human-readable text output and support structured JSON for automation.
- Open Questions:
- None at this stage. The command and lifecycle choices below are locked for `v0.3.0`.
- Resolved Decisions:
- CLI driver control must use explicit stateful sessions. `drive start` returns a `sessionId`, and every subsequent non-start action must require `--session <id>`.
- The CLI must also support `--ephemeral` for one-off debugging actions. In `--ephemeral` mode the command creates a temporary session, performs one action, returns the result, and tears the session down automatically.
- The first public milestone ships built-in named patterns only. User-supplied pattern scripts are out of scope.
- The CLI must not expose low-level browser-control commands in `v0.3.0`. Browser interactions stay behind patterns, verification flows, and internal target helpers.

## Requirements

### Functional Requirements

- FR-1: Expose `wcag`, `inspect`, `drive`, and `run` as stable CLI surfaces.
- FR-2: Wire `wcag` and `inspect` to the normalized WCAG engine without duplicating lookup or search logic in the CLI package.
- FR-3: Expose low-level driver actions for target lifecycle, navigation, interaction mode, key presses, typing, clicking, and log capture.
- FR-4: Normalize low-level driver action results across `virtual`, `voiceover`, and `nvda`.
- FR-5: Expose `run axe` and `run pattern` surfaces that gather repeatable evidence with structured outputs.
- FR-6: Implement first-party reusable patterns for headings, landmarks, forms, dialogs, focus, status messages, auth, and redundant-entry flows.
- FR-7: Keep CLI JSON output aligned with the shared contracts so later MCP and verification code can reuse the same payloads.
- FR-8: Default `wcag` and `inspect` commands to WCAG `2.2` unless the caller explicitly passes `--version 2.1`.
- FR-9: Map every testable row in this sub-plan to one or more scenarios in `specs/gherkin/04-cli-wcag.feature` through `08-cli-run-patterns.feature`.
- FR-10: Require both automated implementation tests and AI-agent manual runs from those mapped feature files before a row can be marked complete.

### Non-Functional Requirements

- NFR-1 (Performance): `wcag` and `inspect` commands should feel immediate for local queries and small local targets.
- NFR-2 (Security): Driver and run commands must make side effects obvious before they launch assistive technology or manipulate the page.
- NFR-3 (Privacy): Speech logs and page excerpts should be omitted from concise output unless requested or required for a failure report.
- NFR-4 (Accessibility): CLI help and output formatting must remain screen-reader-friendly and avoid noisy layout tricks.
- NFR-5 (Observability): Driver actions and pattern runs must preserve timestamps, raw logs, and target metadata for debugging.
- NFR-6 (Reliability): Environment errors such as missing VoiceOver setup or unavailable NVDA must be distinguishable from actual test failures.
- NFR-7 (Maintainability): Low-level driver actions should be implemented once and reused by all patterns and later verification flows.
- NFR-8 (Traceability): Every completed row must point to the exact feature files, automated tests, and manual AI-agent runs that prove it.

## Architecture & Design Overview

- High-level diagram description or pseudo-diagram:

```text
CLI commands
  |
  +-- wcag ----------> wcag-engine
  +-- inspect -------> wcag-engine + target signals
  +-- drive ---------> guidepup driver adapters
  +-- run axe -------> axe execution layer
  +-- run pattern ---> pattern runner -> driver adapters
```

- Data flow, key interfaces, schemas, external services:
- `packages/cli` should only parse arguments, resolve config, call core services, and render output.
- `packages/core` should coordinate target resolution, engine calls, driver sessions, internal browser sessions, and pattern execution.
- `packages/guidepup` should own:
   - target detection
   - session start and stop
   - normalized low-level actions
   - higher-level pattern helpers
- CLI driver sessions must be backed by a local broker process managed by `packages/core`. Session metadata must be stored under `.a11lied/state/sessions/<sessionId>.json`, and follow-up commands must reattach by `sessionId`.
- URL-based `inspect`, `run`, and later `verify` flows must use an internal Playwright-backed browser helper owned by `packages/core`. This helper is an internal dependency only and is not exposed as a public low-level browser-control CLI.
- `axe-core` should run through a dedicated execution path so result normalization stays isolated from CLI formatting.
- In sub-plan 2, public target input support is limited to URL-based targets. Storybook targets are introduced only in sub-plan 3.
- Decisions & trade-offs:
- Prefer explicit subcommands over overloaded flags so agents can script the tool without guessing which mode they are in.
- Prefer raw driver access as a first-class escape hatch, but keep named patterns as the default for repeated workflows.
- Prefer a stable JSON contract even when text output changes for readability later.

## Completion gate

Every row in this sub-plan is incomplete until all of the following are true:

1. The row is mapped to one or more scenarios in `specs/gherkin/04-cli-wcag.feature`, `05-cli-inspect.feature`, `06-cli-drive.feature`, `07-cli-run-axe.feature`, or `08-cli-run-patterns.feature`.
2. Automated implementation tests exist for the mapped scenarios.
3. An AI agent has run a manual acceptance pass from the same feature file or files and recorded the run under `specs/manual-runs/<task-id>/`.
   If the row adds or changes any user-facing surface, that manual run must explicitly exercise the changed surface itself. Automated tests and `npm run standards` do not satisfy that requirement on their own.
4. `npm run standards` passes.

## Task Grid

| Status | ID    | Task                                                  | Priority | Depends On                 | Acceptance Criteria                                                                                                                                                          |
| ------ | ----- | ----------------------------------------------------- | -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]    | CE-01 | Freeze CLI command grammar and output contracts       | H        | R-02                       | `wcag`, `inspect`, `drive`, and `run` semantics are documented, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass                              |
| [ ]    | CE-02 | Implement `wcag` and `inspect` command handlers       | H        | CE-01, R-02                | Local WCAG lookup, search, coverage, and applicability queries work from the CLI, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass            |
| [ ]    | CE-03 | Implement driver session model and target adapters    | H        | CE-01, R-02                | `virtual`, `voiceover`, and `nvda` share one normalized driver contract, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass                     |
| [ ]    | CE-04 | Implement low-level `drive` commands                  | H        | CE-03                      | Driver lifecycle, key, type, read, log, and checkpoint commands work with structured output, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass |
| [ ]    | CE-05 | Implement axe-backed `run` commands                   | H        | CE-01, R-02                | Criteria-, level-, and rule-based axe runs work with normalized result payloads, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass             |
| [ ]    | CE-06 | Implement reusable Guidepup-backed execution patterns | H        | CE-03, CE-04               | Named patterns emit step logs, speech logs, and assertion results consistently, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass              |
| [ ]    | CE-07 | Polish CLI UX, exit codes, and regression tests       | M        | CE-02, CE-04, CE-05, CE-06 | Help output, text formatting, failure semantics, Gherkin traceability, AI-agent manual runs, and standards gate are all satisfied                                            |

## Task Details

### CE-01 - Freeze CLI command grammar and output contracts

**Goal:** Define a command surface that is easy to script and hard to misunderstand.

**Step-by-step instructions:**

1. Write an ADR that defines the top-level command split:

```text
a11lied wcag
a11lied inspect
a11lied drive
a11lied run
```

2. Specify required arguments, optional flags, output modes, and exit codes for each subcommand family.
3. Define this shared JSON output envelope for every CLI command:
   - `ok`: boolean
   - `command`: object with command family, subcommand, and version
   - `target`: object or `null`
   - `result`: object or `null`
   - `warnings`: array
   - `errors`: array
   - `meta`: object with timestamps and schema version
4. Lock this exit-code map:
   - `0`: success
   - `2`: usage or validation error
   - `3`: environment or dependency error
   - `4`: assertion or verification failure
   - `5`: internal runtime error
5. Add CLI help snapshots for the intended surface before implementation drifts.
6. Map `CE-01` to the relevant scenarios in `specs/gherkin/04-cli-wcag.feature`, `05-cli-inspect.feature`, and `06-cli-drive.feature`.
7. Add automated tests or snapshots that implement those scenarios.
8. Run an AI-agent manual acceptance pass from the same feature files and record it under `specs/manual-runs/CE-01/`.
9. Verify `npm run standards` passes before closing the row.

### CE-02 - Implement `wcag` and `inspect` command handlers

**Goal:** Expose the standards and applicability layer directly in the CLI.

**Step-by-step instructions:**

1. Implement `a11lied wcag levels`, `criteria`, `show`, `search`, and `coverage`.
2. Implement `a11lied inspect applicable` and `inspect criterion` for URL targets only in this sub-plan.
3. Wire both command groups to `packages/wcag-engine`.
4. Keep text output readable and compact, and keep JSON output complete enough for automation.
5. Add representative CLI snapshots for:
   - criterion lookup
   - search
   - applicability matrix output
6. Implement automated tests for the mapped scenarios in `specs/gherkin/04-cli-wcag.feature` and `05-cli-inspect.feature`.
7. Run an AI-agent manual acceptance pass from those feature files and record it under `specs/manual-runs/CE-02/`.
8. Verify `npm run standards` passes before closing the row.

### CE-03 - Implement driver session model and target adapters

**Goal:** Normalize low-level accessibility-driver control before building higher-level patterns.

**Step-by-step instructions:**

1. Define `AccessibilityDriverSession` and `DriverActionResult` contracts.
2. Define the required `AccessibilityDriverSession` fields:
   - `sessionId`
   - `target`
   - `startedAt`
   - `capabilities`
   - `logCursor`
   - `brokerPid`
   - `socketPath`
3. Implement target adapters for:
   - `virtual`
   - `voiceover`
   - `nvda`
4. Normalize action names across targets even where the underlying Guidepup method names differ.
5. Preserve target-specific debug fields for cases where normalization is not enough.
6. Add environment checks so each target reports readiness clearly before a session starts.
7. Add stale-session cleanup on CLI startup so orphaned broker metadata does not accumulate after crashes.
8. Implement automated tests for the mapped scenarios in `specs/gherkin/06-cli-drive.feature`.
9. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/CE-03/`.
10.   Verify `npm run standards` passes before closing the row.

### CE-04 - Implement low-level `drive` commands

**Goal:** Let an agent or human operate the screen reader the way a real user would.

**Step-by-step instructions:**

1. Implement session lifecycle commands such as `start`, `stop`, and `status`.
2. Implement action commands such as:

```text
a11lied drive key
a11lied drive type
a11lied drive next
a11lied drive previous
a11lied drive interact
a11lied drive stop-interacting
a11lied drive click-current-item
a11lied drive read
a11lied drive logs
a11lied drive clear-logs
a11lied drive checkpoint
```

3. Require `--session <id>` on every action command unless `--ephemeral` is present.
4. Return structured state after every action, including the last spoken phrase, current item text, and log cursor when available.
5. Keep transcripts and checkpoints available for later pattern or verification layers.
6. Add error handling that distinguishes command misuse, missing target setup, missing session, and runtime target failures.
7. Implement automated tests for the mapped scenarios in `specs/gherkin/06-cli-drive.feature`.
8. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/CE-04/`.
9. Verify `npm run standards` passes before closing the row.

### CE-05 - Implement axe-backed `run` commands

**Goal:** Make automated rule execution easy to target by level, criterion, or explicit rule list.

**Step-by-step instructions:**

1. Implement `run axe` with `--url <url>` as the only public target input in this sub-plan.
2. Support selection by:
   - WCAG level
   - WCAG criterion
   - explicit axe rule ids
3. Use the internal Playwright-backed browser helper to load the URL target, inject axe, and capture DOM context.
4. Normalize axe result payloads so later verification logic can consume them without re-parsing the raw result.
5. Preserve rule ids, node targets, impact metadata, help URLs, and `incomplete` results.
6. Add CLI snapshots and tests for representative A and AA cases.
7. Implement automated tests for the mapped scenarios in `specs/gherkin/07-cli-run-axe.feature`.
8. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/CE-05/`.
9. Verify `npm run standards` passes before closing the row.

### CE-06 - Implement reusable Guidepup-backed execution patterns

**Goal:** Turn common accessibility procedures into repeatable, named building blocks.

**Step-by-step instructions:**

1. Define an `InteractionPattern` contract that consumes a target session and emits structured evidence.
2. Implement the first built-in patterns:
   - `tab_sequence`
   - `landmark_sequence`
   - `heading_sequence`
   - `form_field_walk`
   - `status_message_probe`
   - `dialog_probe`
   - `focus_order_probe`
   - `focus_visibility_probe`
   - `focus_obscured_probe`
   - `auth_flow_probe`
   - `redundant_entry_probe`
3. Build every pattern on top of the low-level driver layer instead of bypassing it.
4. Emit:
   - step log
   - spoken phrase log
   - item text log
   - assertions
   - target metadata
   - optional browser evidence for `focus_visibility_probe` and `focus_obscured_probe`
5. Use the internal Playwright-backed browser helper whenever a pattern needs DOM inspection, visual evidence, or scripted page actions in addition to screen-reader control.
6. Run pattern commands with internal session management by default. They may accept `--session <id>` for advanced debugging, but they must still work without a pre-existing session.
7. Add virtual-target tests and mocked real-target adapter tests for each pattern family.
8. Implement automated tests for the mapped scenarios in `specs/gherkin/08-cli-run-patterns.feature`.
9. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/CE-06/`.
10.   Verify `npm run standards` passes before closing the row.

### CE-07 - Polish CLI UX, exit codes, and regression tests

**Goal:** Make the CLI predictable enough for daily use and future automation.

**Step-by-step instructions:**

1. Finalize text formatting for concise output, verbose output, and JSON output.
2. Map environment failures, validation failures, pattern assertion failures, and internal errors to stable exit codes.
3. Add regression tests for command parsing, help output, and representative JSON payloads.
4. Update `specs/gherkin/traceability.md` for every row in this sub-plan.
5. Run AI-agent manual acceptance passes from the mapped feature files and store them under `specs/manual-runs/CE-07/`.
6. Re-run the shared quality gate:

```sh
npm run standards
```

7. Document unresolved UX issues for the verification and docs sub-plan instead of patching them ad hoc here.

## New Code

- `packages/cli/src/*`: top-level command registration, argument parsing, help text, and result formatting.
- `packages/core/src/*`: orchestration for command execution, target resolution, and output envelopes.
- `packages/core/src/browser/*`: internal Playwright-backed URL target helper used by axe and pattern runs.
- `packages/guidepup/src/*`: driver session model, target adapters, low-level actions, and named patterns.
- `packages/contracts/src/*`: shared JSON payload types for CLI command responses and driver actions.
- `packages/core/test/*` and `packages/guidepup/test/*`: command, adapter, and pattern tests.
- `specs/gherkin/traceability.md`: mapping between CLI/driver rows and Gherkin scenarios.
- `specs/manual-runs/CE-*/*`: AI-agent manual acceptance reports for CLI, driver, and execution rows.

## Tests

- Add CLI parsing and help snapshot tests for `wcag`, `inspect`, `drive`, and `run`.
- Add adapter tests that prove `virtual`, `voiceover`, and `nvda` expose the same normalized driver actions.
- Add command tests for driver lifecycle, key presses, reads, logs, and checkpoints.
- Add axe execution tests for rule selection and result normalization.
- Add pattern tests for headings, landmarks, forms, dialogs, focus, and status-message flows.
- Add exit-code tests for environment failure, user error, and assertion failure cases.
- Add traceability from those tests back to `specs/gherkin/04-cli-wcag.feature` through `08-cli-run-patterns.feature`.
- Add AI-agent manual run reports based on the same feature files before marking rows complete.
- Use `npm run standards` as the closing gate for every completed row.

## Review Checklist

[✓] Have all outstanding questions been answered?
[✓] Are there any ambiguities that need to be resolved?
