# a11ied Driver Command Sets: Implementation Plan (v0.2.0 - 2026-04-19)

## Summary

Add a unified driver command interface that supports Guidepup VoiceOver Commander commands, VoiceOver key code commands, and NVDA key code commands through `a1 drive perform`, with discoverability through `a1 drive commands` and complete command listings in `help-all`. Existing high-level driver actions should remain available as compatibility aliases, but the primary low-level interface should become command-set based, explicit, validated, and easy for AI agents to inspect and execute.

## Objectives & Scope

- In scope: Support Guidepup VoiceOver Commander commands from `VoiceOverCommanderCommands`.
- In scope: Support Guidepup VoiceOver key code commands from `voiceOverKeyCodeCommands`.
- In scope: Support Guidepup NVDA key code commands from `NVDAKeyCodeCommands`.
- In scope: Add `a1 drive perform <command>` as the primary semantic command execution surface.
- In scope: Add `a1 drive commands` as the complete command discovery surface.
- In scope: Update `help-all` to include the complete command list grouped by driver and command set.
- In scope: Keep `a1 drive key` for literal key chords only.
- In scope: Preserve existing commands like `drive next`, `drive previous`, `drive interact`, and `drive click-current-item` as compatibility aliases.
- In scope: Internally refactor high-level no-payload actions to route through the same command execution path where doing so improves consistency.
- In scope: Reject invalid target/command-set combinations before calling Guidepup.
- In scope: Support persistent sessions and ephemeral real-target execution.
- In scope: Add structured JSON output suitable for agent use.
- Out of scope: Requiring real VoiceOver or NVDA in automated CI.
- Out of scope: Changing Guidepup upstream behavior.
- Out of scope: Removing existing CLI commands in this release. Existing commands may become aliases, but deletion should be a separate breaking-change release.

## Assumptions & Open Questions

- Assumptions: The installed Guidepup package is `@guidepup/guidepup@0.24.1`.
- Assumptions: The current Guidepup docs are the source of truth for supported command collections.
- Assumptions: The primary CLI display name should be stable kebab-case because it is consistent across upstream naming styles and easier to type in shell commands.
- Assumptions: The CLI must also accept upstream keys and values for interoperability. Examples: `MOVE_DOWN`, `move down`, `move-down`, `moveToNext`, and `move-to-next`.
- Assumptions: `drive perform` should default to the most natural command set for the selected target.
- Assumptions: For `voiceover`, the default command set should be `voiceover-commander`.
- Assumptions: For `nvda`, the default command set should be `nvda-keycode`.
- Assumptions: `voiceover-keycode` is valid for `voiceover`, but it must be selected explicitly with `--command-set voiceover-keycode` unless the command uses a namespaced prefix.
- Assumptions: Invalid combinations must be rejected. Examples: `--target nvda --command-set voiceover-commander`, `--target voiceover --command-set nvda-keycode`, and any `perform` command against `virtual`.
- Assumptions: `help-all` can be long. The complete command list is intentionally included there.
- Open Questions: None.

## Requirements

### Functional Requirements

- FR-1: Add `a1 drive perform <command>` to execute a semantic screen reader command.
- FR-2: Add `a1 drive commands` to list supported command sets and commands.
- FR-3: Support `voiceover-commander` commands for target `voiceover`.
- FR-4: Support `voiceover-keycode` commands for target `voiceover`.
- FR-5: Support `nvda-keycode` commands for target `nvda`.
- FR-6: Add `--command-set <set>` with values `auto`, `portable`, `voiceover-commander`, `voiceover-keycode`, and `nvda-keycode`.
- FR-7: Default `--command-set` to `auto`.
- FR-8: Resolve `auto` as `voiceover-commander` for target `voiceover`, except for exact portable aliases.
- FR-9: Resolve `auto` as `nvda-keycode` for target `nvda`, except for exact portable aliases.
- FR-10: Reject `auto` for target `virtual` when executing `drive perform`.
- FR-11: Add a `portable` command set for existing cross-driver actions that do not require extra payloads.
- FR-12: Include portable commands at minimum: `next`, `previous`, `interact`, `stop-interacting`, and `activate`.
- FR-13: Keep existing high-level commands as compatibility aliases to portable commands.
- FR-14: Keep `drive key` for literal key chords and do not mix named Guidepup command-set entries into `drive key`.
- FR-15: Keep `drive type`, `drive focus`, `drive read`, `drive logs`, `drive clear-logs`, and `drive checkpoint` as separate commands because they either accept different payloads or inspect/manage session state.
- FR-16: Accept namespaced command input using `<command-set>:<command>`. Examples: `voiceover-keycode:move-to-next`, `voiceover-commander:move-down`, `nvda-keycode:move-to-next`, `portable:next`.
- FR-17: Accept upstream command keys. Examples: `MOVE_DOWN`, `moveToNext`, `performDefaultActionForItem`.
- FR-18: Accept human-readable command values when upstream provides them. Example: `move down`.
- FR-19: Accept stable kebab-case aliases as the preferred CLI format. Examples: `move-down`, `move-to-next`, `perform-default-action-for-item`.
- FR-20: Reject ambiguous aliases with suggestions instead of guessing.
- FR-21: Reject unknown commands with target-aware suggestions.
- FR-22: Return JSON metadata containing requested command, resolved command, command set, target, upstream key, upstream value, description, and representation when available.
- FR-23: `a1 drive commands --json` must provide complete structured command metadata grouped by target and command set.
- FR-24: `a1 help-all` must include the complete supported command list, not just examples.
- FR-25: Persistent session execution must work with `--session <id>`.
- FR-26: Ephemeral execution must work with `--ephemeral --target voiceover|nvda`.
- FR-27: Ephemeral execution without `--target` must use the existing default real target resolution and warnings.
- FR-28: The virtual target must reject `perform` with a clear error explaining that named Guidepup command sets require a real screen reader.
- FR-29: The command registry must be generated from installed Guidepup exports, not manually copied from docs.
- FR-30: The CLI must document the difference between `drive key`, `drive perform`, and the compatibility aliases.

### Non-Functional Requirements

- NFR-1 (Performance): Command lookup must be in-memory and should be O(1) after registry construction.
- NFR-2 (Security): Do not evaluate user-provided command strings. Resolve commands only against known static command registry entries.
- NFR-3 (Privacy): Do not add new logging of spoken phrases, item text, or browser content beyond the existing driver result shape.
- NFR-4 (Accessibility): Preserve current real screen reader behavior and continue warning when the virtual target would otherwise be selected.
- NFR-5 (Observability): Include resolved command metadata in text and JSON output so failed manual QA runs can be reconstructed.
- NFR-6 (i18n): Do not translate upstream command names, values, or descriptions in this release.
- NFR-7 (Reliability): Wait for speech stabilization after `perform`, matching the existing speech-triggering action behavior.
- NFR-8 (Compatibility): Do not remove existing high-level commands in this release.
- NFR-9 (Maintainability): Keep Guidepup command registry logic in `packages/guidepup`, not in CLI command files.
- NFR-10 (Testability): Keep command resolution pure and deterministic so most coverage does not require a real screen reader.
- NFR-11 (Agent usability): Provide command discovery through JSON and stable kebab-case aliases.
- NFR-12 (Help usability): Keep individual command help concise, but include complete command listings in `drive commands` and `help-all`.

## Architecture & Design Overview

High-level pseudo-diagram:

```text
a1 drive commands
a1 drive perform <command>
a1 drive next                 compatibility alias
a1 drive previous             compatibility alias
        |
        v
packages/cli
  commands/drive-actions.ts
  renderers/drive.ts
  lib/execute.ts
        |
        v
packages/core
  driver/runtime.ts
  driver/broker-actions.ts
  driver/runtime-internal.ts
        |
        v
packages/guidepup
  command-registry.ts
  adapter-shared.ts
  adapters.ts
  virtual-adapter.ts
        |
        v
@guidepup/guidepup
  voiceOver.perform(voiceOver.commanderCommands[...])
  voiceOver.perform(voiceOver.keyboardCommands[...])
  nvda.perform(nvda.keyboardCommands[...])
```

Data flow for VoiceOver Commander default:

```text
Command:
  a1 drive perform move-down --target voiceover --ephemeral --json

CLI payload:
  {
    "command": "move-down",
    "commandSet": "auto"
  }

Resolution:
  target voiceover + auto -> voiceover-commander
  move-down -> MOVE_DOWN -> "move down"

Adapter call:
  voiceOver.perform(voiceOver.commanderCommands.MOVE_DOWN)

JSON details:
  {
    "commandSet": "voiceover-commander",
    "requestedCommand": "move-down",
    "resolvedAlias": "move-down",
    "upstreamKey": "MOVE_DOWN",
    "upstreamValue": "move down",
    "target": "voiceover"
  }
```

Data flow for VoiceOver key code explicit selection:

```text
Command:
  a1 drive perform move-to-next --target voiceover --command-set voiceover-keycode --json

Resolution:
  voiceover-keycode:move-to-next -> moveToNext

Adapter call:
  voiceOver.perform(voiceOver.keyboardCommands.moveToNext)
```

Data flow for NVDA default:

```text
Command:
  a1 drive perform move-to-next --target nvda --json

Resolution:
  target nvda + auto -> nvda-keycode
  move-to-next -> moveToNext

Adapter call:
  nvda.perform(nvda.keyboardCommands.moveToNext)
```

Command-set model:

```ts
type DriverCommandSet =
   | 'auto'
   | 'portable'
   | 'voiceover-commander'
   | 'voiceover-keycode'
   | 'nvda-keycode';
```

Resolved command model:

```ts
interface ResolvedDriverCommand {
   target: 'voiceover' | 'nvda' | 'portable';
   commandSet:
      | 'portable'
      | 'voiceover-commander'
      | 'voiceover-keycode'
      | 'nvda-keycode';
   requestedCommand: string;
   resolvedAlias: string;
   upstreamKey: string;
   upstreamValue?: string;
   description?: string;
   representation?: string;
   command: unknown;
}
```

Portable command model:

```ts
const portableCommands = {
   next: { action: 'next', description: 'Move to the next item.' },
   previous: { action: 'previous', description: 'Move to the previous item.' },
   interact: { action: 'interact', description: 'Enter interaction mode.' },
   'stop-interacting': {
      action: 'stop-interacting',
      description: 'Leave interaction mode.',
   },
   activate: {
      action: 'click-current-item',
      description: 'Activate the current item.',
   },
};
```

Design decisions and trade-offs:

- `drive perform` is the primary command because it maps directly to Guidepup `perform(...)` and avoids overloading `drive key`.
- `portable` is included so existing high-level navigation can share the same command discovery and execution model.
- Existing no-payload actions remain as aliases because removing them would be a breaking change and would make common commands less convenient.
- `focus`, `key`, `type`, `read`, `logs`, `clear-logs`, and `checkpoint` remain separate because they are not simple semantic screen reader commands.
- `help-all` will become much longer because it must include complete command lists. This is intentional.
- The registry must be generated from installed Guidepup exports so version changes are captured automatically.

Relevant documentation:

- Guidepup VoiceOver key code commands: https://www.guidepup.dev/docs/api/class-voiceover-key-code-commands
- Guidepup VoiceOver Commander commands: https://www.guidepup.dev/docs/api/class-voiceover-commander-commands
- Guidepup NVDA key code commands: https://www.guidepup.dev/docs/api/class-nvda-key-code-commands

## Task Grid

| Status | ID | Task | Priority | Depends On | Acceptance Criteria |
|---|---|---|---|---|---|
| [ ] | T-01 | Finalize CLI grammar and command naming | H | - | Command grammar, aliases, defaults, and invalid combinations are documented |
| [ ] | T-02 | Add contract support for command execution | H | T-01 | `perform` is a valid driver action and capability |
| [ ] | T-03 | Implement Guidepup command registry | H | T-02 | Registry lists and resolves portable, VoiceOver Commander, VoiceOver key code, and NVDA key code commands |
| [ ] | T-04 | Add adapter command execution | H | T-03 | Real adapters call `perform`; virtual adapter rejects named command sets |
| [ ] | T-05 | Refactor core driver action routing | H | T-04 | `perform` works through persistent, in-memory, and ephemeral paths |
| [ ] | T-06 | Refactor high-level aliases onto portable commands | M | T-05 | Existing high-level commands still work and route through shared command handling where appropriate |
| [ ] | T-07 | Add CLI command discovery and execution | H | T-05 | `drive perform` and `drive commands` work in text and JSON modes |
| [ ] | T-08 | Update help, help-all, and renderers | H | T-07 | `help-all` includes complete command lists grouped by driver and command set |
| [ ] | T-09 | Add automated tests | H | T-08 | Registry, adapter, core, CLI, and help tests cover success and failure paths |
| [ ] | T-10 | Update docs and Gherkin stories | M | T-09 | Docs explain `key` vs `perform`; stories cover all new command sets |
| [ ] | T-11 | Run quality gates and manual smoke checks | H | T-10 | Build, typecheck, tests, formatting, and CLI smoke checks pass |

## Task Details

### T-01 - Finalize CLI grammar and command naming

**Goal:** Lock the user-facing CLI before changing contracts or runtime behavior.

**Step-by-step instructions:**

1. Inspect the current drive command structure.

```sh
node packages/cli/dist/cli.js drive --help
node packages/cli/dist/cli.js drive key --help
node packages/cli/dist/cli.js help-all
```

2. Define the primary execution command.

```text
a1 drive perform <command>
```

3. Define the discovery command.

```text
a1 drive commands
```

4. Define supported command sets.

```text
auto
portable
voiceover-commander
voiceover-keycode
nvda-keycode
```

5. Define default resolution behavior.

```text
target=voiceover, command-set=auto -> portable exact match first, otherwise voiceover-commander
target=nvda, command-set=auto -> portable exact match first, otherwise nvda-keycode
target=virtual, command-set=auto -> reject for perform
```

6. Define explicit namespaced command input.

```text
portable:next
voiceover-commander:move-down
voiceover-keycode:move-to-next
nvda-keycode:move-to-next
```

7. Define invalid combinations.

```text
voiceover + nvda-keycode -> invalid
nvda + voiceover-commander -> invalid
nvda + voiceover-keycode -> invalid
virtual + any perform command set -> invalid
```

8. Define display naming.

```text
Primary CLI alias: kebab-case
Accepted input: kebab-case, upstream key, upstream value, namespaced alias
JSON output: include all known names
```

9. Record examples that must work.

```sh
a1 drive perform next --target voiceover --ephemeral
a1 drive perform move-down --target voiceover --ephemeral
a1 drive perform move-to-next --target voiceover --command-set voiceover-keycode --ephemeral
a1 drive perform move-to-next --target nvda --ephemeral
a1 drive perform voiceover-keycode:move-to-next --target voiceover --ephemeral
a1 drive commands --target voiceover
a1 drive commands --target nvda --json
```

### T-02 - Add contract support for command execution

**Goal:** Make `perform` a first-class driver action in shared schemas.

**Step-by-step instructions:**

1. Open the shared contracts file.

```sh
sed -n '90,220p' packages/contracts/src/schemas/core.ts
```

2. Add `perform` to `driverCapabilitySchema`.
3. Add `perform` to `driverActionNameSchema`.
4. Add any shared command metadata schemas only if multiple packages need validation at the contract layer.
5. Run the contracts typecheck.

```sh
npm run typecheck --workspace @a11ied/contracts
```

### T-03 - Implement Guidepup command registry

**Goal:** Build a pure registry that lists and resolves all supported command sets from installed Guidepup exports.

**Step-by-step instructions:**

1. Create the registry file.

```text
packages/guidepup/src/command-registry.ts
```

2. Import Guidepup command collections.

```ts
import {
   NVDAKeyCodeCommands,
   VoiceOverCommanderCommands,
   voiceOverKeyCodeCommands,
} from '@guidepup/guidepup';
```

3. Add portable command metadata.
4. Implement alias generation for upstream keys.
5. Implement lookup normalization.
6. Build command entries for each command set.
7. Implement `listDriverCommands(options)`.
8. Implement `resolveDriverCommand(request)`.
9. Make `resolveDriverCommand(...)` reject invalid target/set combinations before lookup.
10. Make `resolveDriverCommand(...)` support namespaced prefixes.
11. Make `resolveDriverCommand(...)` support target default selection.
12. Make `resolveDriverCommand(...)` reject ambiguity with suggestions.
13. Export serializable command metadata types.
14. Export only serializable command lists from public listing APIs.

### T-04 - Add adapter command execution

**Goal:** Execute resolved commands through Guidepup `perform(...)`.

**Step-by-step instructions:**

1. Add `perform` to `driverCapabilities`.
2. Add `performCommand(...)` to `DriverAdapter`.
3. In `RealScreenReaderAdapter.performCommand(...)`, resolve the command.
4. If the resolved command set is `portable`, dispatch to existing adapter methods.
5. If the resolved command set is a Guidepup command set, call `this.reader.perform(resolved.command, inputCommandOptions)`.
6. Return serializable metadata without the raw `command` object.
7. Implement `performCommand(...)` on the virtual adapter by throwing a clear unsupported error.
8. Run typecheck.

```sh
npm run typecheck --workspace @a11ied/guidepup
```

### T-05 - Refactor core driver action routing

**Goal:** Route `perform` through all existing runtime paths.

**Step-by-step instructions:**

1. Add `perform` to `SPEECH_TRIGGERING_ACTIONS`.
2. Add `perform` to `payloadActionHandlers`.
3. Implement `handlePerformAction(...)`.
4. Normalize registry errors into `CliUsageError` where appropriate.
5. Ensure in-memory and persistent broker paths both use the same handler.
6. Run targeted core tests.

```sh
npx vitest run packages/core/src/driver/broker-handlers.test.ts packages/core/src/driver/runtime.test.ts
```

### T-06 - Refactor high-level aliases onto portable commands

**Goal:** Keep existing commands while making their implementation consistent with the new command model.

**Step-by-step instructions:**

1. Identify existing no-payload high-level commands.
2. Update the CLI handlers for these commands to submit action `perform` with a portable command payload.
3. Map `click-current-item` to portable alias `activate`.
4. Preserve visible command names and output semantics.
5. Keep direct core handlers for payload or state-management commands.
6. Add tests that existing high-level commands still work.

### T-07 - Add CLI command discovery and execution

**Goal:** Add the user-facing `drive perform` and `drive commands` commands.

**Step-by-step instructions:**

1. Add `registerPerformCommand(...)`.
2. Define `drive perform <command>`.
3. Add options.

```text
--command-set <set>
--session <id>
--target <platform>
--ephemeral
--allow-virtual
--json
--verbose
```

4. Add `registerCommandsCommand(...)`.
5. Define `drive commands`.
6. Add options.

```text
--target <platform>
--command-set <set>
--query <text>
--json
--verbose
```

7. Route listing through core or through `#core` exports.
8. Add `perform` to the `DriveAction` union in `packages/cli/src/lib/execute.ts`.
9. Build CLI.

```sh
npm run build --workspace a11ied
```

### T-08 - Update help, help-all, and renderers

**Goal:** Make output useful for humans, scripts, and AI agents.

**Step-by-step instructions:**

1. Add text rendering for performed command details.
2. Add text rendering for command listings.
3. Render command lists grouped by target and command set.
4. Include columns.

```text
Alias
Upstream key
Value
Keys
Description
```

5. Update JSON output to include structured command metadata.
6. Update `help-all` implementation to include complete command list output.
7. Update fixtures.
8. Verify help output.

```sh
node packages/cli/dist/cli.js help-all
node packages/cli/dist/cli.js help-all | rg "voiceover-commander|voiceover-keycode|nvda-keycode"
```

### T-09 - Add automated tests

**Goal:** Cover resolution, routing, CLI behavior, help output, and failure paths without requiring real screen readers.

**Step-by-step instructions:**

1. Add registry tests.
2. Test VoiceOver Commander list contains `move-down` and upstream key `MOVE_DOWN`.
3. Test VoiceOver key code list contains `move-to-next` and upstream key `moveToNext`.
4. Test NVDA key code list contains `move-to-next` when present in installed Guidepup.
5. Test kebab-case lookup.
6. Test upstream key lookup.
7. Test upstream value lookup.
8. Test namespaced lookup.
9. Test invalid target/command-set combinations.
10. Test virtual rejection.
11. Test ambiguity handling.
12. Add core tests for `perform` action routing.
13. Add CLI tests for command listing.
14. Add help tests for `drive perform`, `drive commands`, and `help-all`.

### T-10 - Update docs and Gherkin stories

**Goal:** Document the unified command model and update acceptance stories.

**Step-by-step instructions:**

1. Update low-level CLI guide.
2. Add a section named `Key chords vs named commands`.
3. Explain `drive key`.
4. Explain portable `drive perform`.
5. Explain VoiceOver Commander commands.
6. Explain VoiceOver key code commands.
7. Explain NVDA key code commands.
8. Explain command discovery.
9. Add Gherkin scenarios for command discovery and invalid command-set combinations.
10. Update traceability.

### T-11 - Run quality gates and manual smoke checks

**Goal:** Verify the complete implementation.

**Step-by-step instructions:**

1. Build affected packages.

```sh
npm run build --workspace @a11ied/contracts
npm run build --workspace @a11ied/guidepup
npm run build --workspace @a11ied/core
npm run build --workspace a11ied
```

2. Run typechecks.

```sh
npm run typecheck --workspace @a11ied/contracts
npm run typecheck --workspace @a11ied/guidepup
npm run typecheck --workspace @a11ied/core
npm run typecheck --workspace a11ied
```

3. Run targeted tests.

```sh
npx vitest run \
  packages/guidepup/src/command-registry.test.ts \
  packages/guidepup/src/index.test.ts \
  packages/core/src/driver/broker-handlers.test.ts \
  packages/core/src/driver/runtime.test.ts \
  packages/cli/src/testing/handlers-drive.test.ts \
  packages/cli/src/program.test.ts
```

4. Run CLI smoke checks.

```sh
node packages/cli/dist/cli.js drive commands
node packages/cli/dist/cli.js drive commands --target voiceover --json
node packages/cli/dist/cli.js drive commands --target nvda --json
node packages/cli/dist/cli.js help-all | rg "voiceover-commander|voiceover-keycode|nvda-keycode"
```

## New Code

- Add `packages/guidepup/src/command-registry.ts`.
- Add `packages/guidepup/src/command-registry.test.ts`.
- Modify `packages/guidepup/src/index.ts`.
- Modify `packages/guidepup/src/adapter-shared.ts`.
- Modify `packages/guidepup/src/adapters.ts`.
- Modify `packages/guidepup/src/virtual-adapter.ts`.
- Modify `packages/contracts/src/schemas/core.ts`.
- Modify `packages/core/src/driver/broker-actions.ts`.
- Modify `packages/core/src/driver/runtime.ts`.
- Modify `packages/cli/src/commands/drive-actions.ts`.
- Modify `packages/cli/src/lib/execute.ts`.
- Modify `packages/cli/src/renderers/drive.ts`.
- Modify `packages/cli/src/program.ts` or `packages/cli/src/lib/help.ts`.
- Modify `packages/cli/src/program-help-fixtures.ts`.
- Modify `docs/cli-low-level-guide.md`.
- Modify `specs/gherkin/traceability.md`.

Documentation sources checked:

- Guidepup VoiceOver key code commands: https://www.guidepup.dev/docs/api/class-voiceover-key-code-commands
- Guidepup VoiceOver Commander commands: https://www.guidepup.dev/docs/api/class-voiceover-commander-commands
- Guidepup NVDA key code commands: https://www.guidepup.dev/docs/api/class-nvda-key-code-commands

Version assumption:

```text
@guidepup/guidepup@0.24.1
```

## Tests

- Test command registry lists `portable`, `voiceover-commander`, `voiceover-keycode`, and `nvda-keycode`.
- Test `voiceover-commander` contains `move-down` mapped to upstream key `MOVE_DOWN`.
- Test `voiceover-keycode` contains `move-to-next` mapped to upstream key `moveToNext`.
- Test `nvda-keycode` contains `move-to-next` mapped to upstream key `moveToNext` when available in the installed Guidepup version.
- Test exact upstream key lookup.
- Test human-readable value lookup.
- Test kebab-case alias lookup.
- Test namespaced lookup.
- Test `auto` defaults for VoiceOver and NVDA.
- Test explicit `voiceover-keycode` selection for VoiceOver.
- Test invalid `nvda + voiceover-commander`.
- Test invalid `voiceover + nvda-keycode`.
- Test invalid `virtual + perform`.
- Test unknown command suggestions.
- Test ambiguous command rejection.
- Test adapter `performCommand(...)` with fake readers.
- Test core broker routes `perform`.
- Test in-memory runtime routes `perform`.
- Test CLI `drive commands --json`.
- Test CLI `drive perform <command> --json`.
- Test existing high-level commands still work.
- Test `help-all` contains complete command lists.
- Test docs examples where practical.

## Review Checklist

[ ] Have all outstanding questions been answered?
[ ] Are there any ambiguities that need to resolved?
[ ] Does the implementation include VoiceOver key code commands?
[ ] Does the implementation include VoiceOver Commander commands?
[ ] Does the implementation include NVDA key code commands?
[ ] Does the implementation reject invalid target and command-set combinations?
[ ] Does the implementation preserve existing high-level commands while allowing internal refactor?
[ ] Does `drive commands` provide the complete discovery surface?
[ ] Does `help-all` include the complete command list?
[ ] Does the implementation distinguish literal key chords from named Guidepup commands?
[ ] Do tests avoid requiring real screen readers in CI?
