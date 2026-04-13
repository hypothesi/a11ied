# [a11ied post-v0.3 docs, api docs, and recording]: Implementation Plan (v0.3.1 – 2026-04-08)

## Summary

Close three obvious gaps left after the first milestone: finish the operator docs site so it covers the shipped surfaces, add real JSDoc coverage for public exported APIs, and expose Guidepup-backed video recording from the CLI for real screen-reader sessions.

## Objectives & Scope

- In scope: docs-site coverage for CLI, MCP, public package APIs, and recording workflows.
- In scope: JSDoc blocks for public exported functions and classes in workspace packages that ship a public `exports` entrypoint.
- In scope: CLI and core-runtime support for starting and stopping Guidepup-backed video recordings for real screen-reader sessions.
- In scope: acceptance specs, automated tests, manual runs, traceability updates, and bead tracking for this follow-up work.
- Out of scope: redesigning the existing verification model, changing WCAG strategy generation, or promising recording support for Linux or the virtual target.

## Assumptions & Open Questions

- Assumptions:
- The current host is macOS and VoiceOver readiness remains available for one real manual recording pass.
- `@guidepup/record` is the recording primitive to build on for this release line.
- Recording support should target real assistive technology runs first. It should not pretend that a headless virtual-target run has useful video output.
- Open Questions:
- None for this slice. The follow-up work is intentionally narrow.

## Requirements

### Functional Requirements

- FR-1: The docs site must document every public surface that ships in `v0.3.x`: CLI usage, MCP usage, public package APIs, and recording support.
- FR-2: Public exported functions and classes in workspace entrypoints must carry JSDoc blocks that explain purpose, key inputs, and return behavior.
- FR-3: The CLI must support video recording for real screen-reader sessions using the installed Guidepup recording package.
- FR-4: Recording support must work for persistent driver sessions and managed higher-level runs that create their own real target session.
- FR-5: Recording metadata must appear in structured output so downstream tooling can locate the artifact.
- FR-6: Unsupported recording requests must fail explicitly instead of silently ignoring the flag.
- FR-7: Every new row must map to Gherkin scenarios, automated tests, and AI-agent manual runs before it can close.

### Non-Functional Requirements

- NFR-1 (Performance): Recording support must not change the behavior of commands when recording is not requested.
- NFR-2 (Security): Recording must require an explicit output path. The CLI must not start background capture implicitly.
- NFR-3 (Privacy): Docs must call out that recordings may capture page content, AT output, and machine-local context.
- NFR-4 (Accessibility): Docs and command output must remain readable without depending on video artifacts.
- NFR-5 (Observability): Recording status and output path must be preserved in structured command results where recording is active.
- NFR-6 (Maintainability): JSDoc coverage should be enforced by tests so the repo does not slide backward.

## Architecture & Design Overview

- High-level diagram description or pseudo-diagram:

```text
public package entrypoints
        |
        v
  JSDoc coverage test

CLI flags -> core driver/pattern/verification runtime -> Guidepup record adapter
        |                                                |
        v                                                v
  docs examples and warnings                      recording artifact metadata
```

- Data flow, key interfaces, schemas, external services:
- Recording should be represented as optional session metadata on driver-backed runs.
- Persistent driver recording should be owned by the broker process so it can survive between `drive start` and `drive stop`.
- Higher-level `run pattern` and `verify` flows should pass recording configuration through to the driver session they create.
- The docs site should add route-level coverage for:
   - CLI reference
   - MCP usage
   - API reference
   - recording sessions
- Decisions & trade-offs:
- Prefer explicit real-target-only recording support over a fake “works everywhere” flag.
- Prefer concise JSDoc on public APIs over trying to document every internal helper.
- Prefer route-level docs pages over one giant landing page that buries the useful parts.

## Completion gate

Every row in this follow-up plan is incomplete until all of the following are true:

1. The row is mapped to one or more scenarios in `specs/gherkin/13-post-v0.3-docs-api-recording.feature`.
2. Automated implementation tests exist for the mapped scenarios.
3. An AI agent has run a manual acceptance pass from the same feature file and recorded it under `specs/manual-runs/<task-id>/`.
   If the row changes a user-facing surface, the manual run must explicitly exercise that surface itself.
4. `npm run standards` passes.

## Task Grid

| Status | ID    | Task                                           | Priority | Depends On | Acceptance Criteria                                                                                                                                                               |
| ------ | ----- | ---------------------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [✓]    | PD-01 | Finish docs-site coverage for shipped surfaces | H        | —          | Docs cover CLI, MCP, public API, and recording usage; mapped Gherkin tests exist; AI-agent manual run is recorded; and standards pass                                             |
| [✓]    | PD-02 | Enforce JSDoc coverage for public exported API | H        | PD-01      | Public exported functions and classes have JSDoc and a regression test enforces that; mapped Gherkin tests exist; AI-agent manual run is recorded; standards pass                 |
| [?]    | PD-03 | Add Guidepup-backed recording support          | H        | PD-01      | CLI and core runtime expose explicit recording support for real AT sessions with structured metadata; mapped Gherkin tests exist; AI-agent manual run is recorded; standards pass |

## Task Details

### PD-01 - Finish docs-site coverage for shipped surfaces

**Goal:** Make the docs site actually cover the product that ships, not just a slice of it.

**Step-by-step instructions:**

1. Add docs routes for:
   - CLI reference
   - MCP usage
   - public API reference
   - recording sessions
2. Update the home page and shell navigation so those routes are discoverable.
3. Explain which surfaces are operator-facing versus library-facing.
4. Add blunt warnings where the product can be misused, especially around evidence claims and recordings.
5. Implement automated tests for the mapped scenarios in `specs/gherkin/13-post-v0.3-docs-api-recording.feature`.
6. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/PD-01/`.
7. Verify `npm run standards` passes before closing the row.

### PD-02 - Enforce JSDoc coverage for public exported API

**Goal:** Make the public package API legible without reading implementation files line by line.

**Step-by-step instructions:**

1. Identify public exported functions and classes reachable through each package entrypoint.
2. Add JSDoc blocks for those symbols in the implementation files that declare them.
3. Keep the comments short and factual:
   - what the symbol does
   - major parameters
   - what it returns or changes
4. Add an automated test that fails when a covered public export loses its JSDoc block.
5. Implement automated tests for the mapped scenarios in `specs/gherkin/13-post-v0.3-docs-api-recording.feature`.
6. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/PD-02/`.
7. Verify `npm run standards` passes before closing the row.

### PD-03 - Add Guidepup-backed recording support

**Goal:** Let operators capture a real AT session as video from the same CLI they use to drive it.

**Step-by-step instructions:**

1. Add a recording configuration model to the driver session path.
2. Implement broker-owned recording lifecycle so `drive start` can begin capture and `drive stop` can end it.
3. Expose CLI flags for recording on:
   - `drive start`
   - managed `run pattern`
   - managed `verify criterion`
   - managed `verify level`
4. Reject unsupported combinations explicitly, including:
   - virtual target recording
   - reused sessions plus a new recording path
   - unsupported host OS
5. Include recording metadata in structured output.
6. Add docs coverage for setup, supported targets, privacy caveats, and artifact paths.
7. Implement automated tests for the mapped scenarios in `specs/gherkin/13-post-v0.3-docs-api-recording.feature`.
8. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/PD-03/`.
9. If the host remains ready, exercise one real VoiceOver recording path and record the exact command plus output artifact.
10.   Verify `npm run standards` passes before closing the row.

## New Code

- `plans/a11ied-post-v0.3-docs-api-recording-plan.md`
   - New follow-up plan document for docs coverage, API docs, and recording work.
- `specs/gherkin/13-post-v0.3-docs-api-recording.feature`
   - Acceptance scenarios for docs coverage, JSDoc coverage, and recording behavior.
- `apps/docs/src/pages/*.astro`
   - New route pages for missing shipped surfaces and recording guidance.
- `packages/*/src/**/*.ts`
   - JSDoc updates on public exported functions and classes.
- `packages/core/src/driver/*.ts`
   - Recording lifecycle support for persistent broker-backed sessions.
- `packages/cli/src/commands/*.ts`
   - Recording flags and validation for driver, pattern, and verification commands.
- `packages/contracts/src/schemas/core.ts`
   - Optional recording metadata on driver session structures if needed by the public output contract.
- `packages/core/src/docs-release.test.ts` or new test files
   - Regression tests for docs coverage and JSDoc enforcement.

## Tests

- Add docs-site tests that assert the new public-surface routes exist and are linked from the docs home page.
- Add a JSDoc coverage test for public exported functions and classes.
- Add CLI and core tests for recording validation, recording metadata, and broker lifecycle behavior.
- Run one real VoiceOver-backed manual recording smoke if the host is ready.

## Review Checklist

- [x] Have all outstanding questions been answered?
- [x] Are there any ambiguities that need to resolved?
