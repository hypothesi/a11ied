# [a11lied verification, integrations, and adoption]: Implementation Plan (v0.3.0 – 2026-04-06)

## Summary

Turn raw WCAG knowledge and execution evidence into useful outcomes. This sub-plan implements criterion and level verification, Storybook integration, MCP exposure, docs and Agent Skill guidance, and the CI and release work needed to ship the system with some confidence.

## Objectives & Scope

- In scope: verification orchestration, evidence and verdict schemas, Storybook bridge, MCP tools and resources, docs updates, Agent Skill updates, CI hardening, and release-path documentation.
- In scope: criterion-level and level-level verification that preserves uncovered and manual-only criteria explicitly.
- In scope: adoption work that teaches humans and agents how to use the tool without bluffing about compliance.
- In scope: tying each testable verification, Storybook, MCP, docs, and release row to `specs/gherkin/09-12` with both automated tests and AI-agent manual runs.
- Out of scope: redesigning the WCAG data engine, changing CLI driver contracts, or replacing the built-in execution patterns from earlier sub-plans.

## Assumptions & Open Questions

- Assumptions:
- The data engine from sub-plan 1 and the CLI plus driver layer from sub-plan 2 are available and stable enough to compose.
- Verification must never collapse raw evidence into a fake single "compliant" boolean.
- Storybook should reuse the same target abstraction as URL-based runs.
- Open Questions:
- None at this stage. Verification and release behavior are locked for `v0.3.0`.
- Resolved Decisions:
- `verify level` must always emit a complete criterion matrix. It must never short-circuit on the first failure.
- MCP must expose both structured tools and read-only resources in the first public milestone.
- CI for every pull request must run virtual-target smoke coverage only. Real-target VoiceOver and NVDA smoke runs are mandatory manual release checks before any public minor or major release.

## Requirements

### Functional Requirements

- FR-1: Implement criterion-level verification that resolves a criterion, checks applicability, chooses the right evidence path, runs it, and emits an explicit verdict.
- FR-2: Implement level-based verification that expands A, AA, or AAA into criteria and aggregates results without hiding manual-only or uncovered rows.
- FR-3: Reuse the same result and evidence model across CLI, Storybook, and MCP surfaces.
- FR-4: Implement Storybook target resolution so stories can flow through inspect, drive, run, and verify paths.
- FR-5: Expose MCP tools and resources for lookup, applicability, driver control, execution, and verification without separate business logic.
- FR-6: Expand docs and the Agent Skill so the workflow for criterion selection, driver use, and evidence interpretation is obvious.
- FR-7: Add CI and release checks that prove the system still works end to end after changes.
- FR-8: Map every testable row in this sub-plan to one or more scenarios in `specs/gherkin/09-cli-verify.feature` through `12-docs-and-release.feature`.
- FR-9: Require both automated implementation tests and AI-agent manual runs from those mapped feature files before a row can be marked complete.

### Non-Functional Requirements

- NFR-1 (Performance): Criterion verification should avoid unnecessary repeated setup work, especially when verifying a whole level.
- NFR-2 (Security): MCP tools must make all side effects and local-environment interactions explicit.
- NFR-3 (Privacy): Reports and docs should avoid leaking page content or local machine details beyond what the evidence path requires.
- NFR-4 (Accessibility): Verification reports, docs pages, and MCP text resources must remain readable and useful with screen readers.
- NFR-5 (Observability): Every verification result must preserve sources used, procedures run, timing, and uncovered work.
- NFR-6 (Reliability): CI must distinguish between broken setup, broken automation, and actual accessibility failures.
- NFR-7 (Maintainability): Docs, MCP, CLI, and Storybook should all consume the same verification and evidence contracts.
- NFR-8 (Traceability): Every completed row must point to the exact feature files, automated tests, and manual AI-agent runs that prove it.

## Architecture & Design Overview

- High-level diagram description or pseudo-diagram:

```text
wcag-engine + driver + execution results
                |
                v
       verification orchestration
                |
   ---------------------------------
   |               |               |
   v               v               v
 CLI reports   Storybook bridge   MCP tools/resources
                |
                v
         docs + skill guidance
```

- Data flow, key interfaces, schemas, external services:
- The verification layer should consume:
   - criterion metadata and coverage from `packages/wcag-engine`
   - verification-strategy metadata from `packages/wcag-engine`
   - driver actions and pattern outputs from `packages/guidepup`
   - axe execution results from the execution layer
- The verification output should emit:
   - criterion id
   - applicability status
   - verdict
   - evidence mode
   - sources used
   - logs and references
   - uncovered or manual-only notes
- The top-level verification report payload must include:
   - `target`
   - `wcagVersion`
   - `requestedScope`
   - `summary`
   - `criteria`
   - `warnings`
   - `errors`
- The verification layer must not invent its own criterion-to-procedure mapping. It must use the generated verification-strategy artifact from sub-plan 1.
- Storybook should normalize story ids and iframe URLs into the same target abstraction used elsewhere.
- MCP should expose both tools for active execution and resources for read-only standards material.
- Decisions & trade-offs:
- Prefer full criterion matrices over short "AA passed" summaries.
- Prefer one verification engine consumed by all surfaces instead of separate CLI and MCP orchestration logic.
- Prefer docs that explain uncertainty and coverage gaps directly rather than trying to market around them.

## Completion gate

Every row in this sub-plan is incomplete until all of the following are true:

1. The row is mapped to one or more scenarios in `specs/gherkin/09-cli-verify.feature`, `10-storybook-integration.feature`, `11-mcp.feature`, or `12-docs-and-release.feature`.
2. Automated implementation tests exist for the mapped scenarios.
3. An AI agent has run a manual acceptance pass from the same feature file or files and recorded the run under `specs/manual-runs/<task-id>/`.
   If the row adds or changes any user-facing surface, that manual run must explicitly exercise the changed surface itself. Automated tests and `npm run standards` remain required, but they do not count as that surface exercise.
4. `npm run standards` passes.

## Task Grid

| Status | ID    | Task                                                 | Priority | Depends On                        | Acceptance Criteria                                                                                                                                                  |
| ------ | ----- | ---------------------------------------------------- | -------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]    | VI-01 | Lock evidence, verdict, and report schemas           | H        | R-02, R-03                        | Shared verification payloads are stable across CLI, Storybook, and MCP, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass              |
| [ ]    | VI-02 | Implement criterion-level verification orchestration | H        | VI-01, R-02, R-03                 | `verify criterion` produces explicit verdicts with evidence and coverage notes, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass      |
| [ ]    | VI-03 | Implement level-based verification aggregation       | H        | VI-02                             | `verify level` emits a criterion matrix with aggregate summaries and uncovered rows, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass |
| [ ]    | VI-04 | Implement Storybook bridge and target resolution     | M        | VI-01, R-03                       | Stories can be inspected, driven, run, and verified through the shared runtime, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass      |
| [ ]    | VI-05 | Implement MCP tools and resources                    | M        | VI-01, VI-02, VI-03, R-03         | MCP exposes knowledge, driver, execution, and verification with contract parity, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass     |
| [ ]    | VI-06 | Expand docs site and Agent Skill                     | M        | VI-02, VI-03, VI-04, VI-05        | Docs and skill teach the workflow and call out evidence limits clearly, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass              |
| [ ]    | VI-07 | Harden CI, smoke tests, and release path             | M        | VI-02, VI-03, VI-04, VI-05, VI-06 | Release readiness has repeatable smoke tests, mapped Gherkin tests, AI-agent manual run, and passing standards gate                                                  |

## Task Details

### VI-01 - Lock evidence, verdict, and report schemas

**Goal:** Define one verification payload that every surface can trust.

**Step-by-step instructions:**

1. Add shared schemas for:
   - evidence entries
   - criterion verification results
   - level verification results
   - report summaries
   - verification execution plans
   - top-level verification report payloads
2. Define explicit enums for:
   - verdict state
   - evidence mode
   - coverage state
   - applicability state
3. Ensure the schema can preserve raw speech logs, assertion results, axe findings, and uncovered-work notes without collapsing them into one free-form string.
4. Add round-trip tests and fixture examples for both passing and mixed-result reports.
5. Implement automated tests for the mapped scenarios in `specs/gherkin/09-cli-verify.feature`.
6. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/VI-01/`.
7. Verify `npm run standards` passes before closing the row.

### VI-02 - Implement criterion-level verification orchestration

**Goal:** Turn one criterion request into an honest, evidence-backed result.

**Step-by-step instructions:**

1. Implement `verify criterion` so it:
   - resolves the criterion
   - reads coverage metadata
   - reads verification-strategy metadata
   - checks applicability
   - selects axe, driver, pattern, or hybrid evidence paths
   - executes the chosen procedures
   - emits a structured result
2. Preserve why the engine chose each evidence path, including the strategy id and procedure ids it followed.
3. Keep manual-only or not-covered outcomes explicit rather than turning them into soft passes.
4. Add tests for representative criteria such as:
   - `1.3.1`
   - `2.4.3`
   - `3.3.8`
   - `4.1.3`
5. Implement automated tests for the mapped scenarios in `specs/gherkin/09-cli-verify.feature`.
6. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/VI-02/`.
7. Verify `npm run standards` passes before closing the row.

### VI-03 - Implement level-based verification aggregation

**Goal:** Expand A, AA, or AAA verification into a readable matrix without losing detail.

**Step-by-step instructions:**

1. Implement `verify level` on top of criterion verification instead of duplicating logic.
2. Expand the selected level into the relevant criterion set for the requested WCAG version.
3. Run applicability and verification for each criterion while reusing target setup where possible.
4. Emit:
   - per-criterion rows
   - grouped summaries by verdict and evidence mode
   - uncovered and manual-only sections
5. Add tests for mixed outcomes where one level contains passes, fails, non-applicable rows, and manual-only rows.
6. Implement automated tests for the mapped scenarios in `specs/gherkin/09-cli-verify.feature`.
7. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/VI-03/`.
8. Verify `npm run standards` passes before closing the row.

### VI-04 - Implement Storybook bridge and target resolution

**Goal:** Make local component work flow through the same verification engine as page-level targets.

**Step-by-step instructions:**

1. Implement Storybook target resolution from `--storybook-url <baseUrl> --story-id <id>` to iframe URL and page metadata by reusing the same internal Playwright-backed browser helper used for URL targets.
2. Reuse the same target abstraction used by URL-based commands.
3. Allow Storybook metadata or parameters to supply optional applicability hints.
4. Ensure `inspect`, `drive`, `run`, and `verify` can all accept Storybook targets through the same core orchestration path.
5. Add a minimal Storybook fixture app and integration tests.
6. Implement automated tests for the mapped scenarios in `specs/gherkin/10-storybook-integration.feature`.
7. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/VI-04/`.
8. Verify `npm run standards` passes before closing the row.

### VI-05 - Implement MCP tools and resources

**Goal:** Expose the same runtime to editors and agents without forking the business logic.

**Step-by-step instructions:**

1. Implement MCP tools for:
   - criterion lookup
   - level lookup
   - search
   - applicability
   - driver actions
   - execution
   - verification
2. Require `sessionId` on every stateful MCP driver tool after `driver_start_session`.
3. Implement MCP resources for read-only criteria, level lists, coverage data, and verification-strategy summaries.
4. Keep every tool wired to the same core orchestration used by the CLI.
5. Document tool side effects clearly, especially where a tool can launch or drive assistive technology.
6. Add smoke tests that invoke the tools through an MCP client fixture.
7. Implement automated tests for the mapped scenarios in `specs/gherkin/11-mcp.feature`.
8. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/VI-05/`.
9. Verify `npm run standards` passes before closing the row.

### VI-06 - Expand docs site and Agent Skill

**Goal:** Teach people and agents how to use the product without bluffing about certainty.

**Step-by-step instructions:**

1. Add docs pages for:
   - WCAG data sources
   - criterion lookup
   - applicability
   - driver usage
   - pattern execution
   - verification semantics
2. Add examples that show the difference between:
   - automated evidence
   - hybrid evidence
   - manual review requirements
3. Update `skills/a11lied/SKILL.md` so it teaches criterion resolution, driver use, evidence selection, and overclaim guardrails.
4. Implement automated tests for the mapped scenarios in `specs/gherkin/12-docs-and-release.feature`.
5. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/VI-06/`.
6. Verify the docs site still builds:

```sh
npm run build
```

7. Keep the guidance blunt where needed, especially around raw driver transcripts versus compliance verdicts.
8. Verify `npm run standards` passes before closing the row.

### VI-07 - Harden CI, smoke tests, and release path

**Goal:** Make the combined system safe to evolve and credible to ship.

**Step-by-step instructions:**

1. Add CI jobs or steps for:
   - data validation
   - contract tests
   - CLI command smoke tests
   - virtual-target verification smoke tests
   - docs build
2. Require these release gates before a public minor or major release can cut:
   - all CI checks pass
   - one macOS VoiceOver smoke run passes manually
   - one Windows NVDA smoke run passes manually
   - deferred items are reviewed and accepted explicitly
3. Document the release path for packages, docs, and the Agent Skill.
4. Implement automated tests for the mapped scenarios in `specs/gherkin/12-docs-and-release.feature`.
5. Run an AI-agent manual acceptance pass from that feature file and record it under `specs/manual-runs/VI-07/`.
6. Re-run the shared quality gate:

```sh
npm run standards
```

7. Record deferred items clearly instead of leaving them implied.

## New Code

- `packages/contracts/src/*`: evidence, verdict, and report schemas.
- `packages/core/src/*`: verification orchestration and target reuse logic.
- `packages/core/src/browser/*`: shared Playwright-backed browser target helper reused by URL and Storybook verification flows.
- `packages/storybook/src/*`: Storybook target resolution and metadata plumbing.
- `packages/mcp-server/src/*`: tool handlers, resources, and smoke-test fixtures.
- `apps/docs/src/pages/*`: docs for verification, driver use, MCP workflows, and coverage semantics.
- `skills/a11lied/SKILL.md`: updated skill instructions for the final runtime workflow.
- `.github/workflows/*`: CI steps for validation, smoke tests, and release readiness.
- `specs/gherkin/traceability.md`: mapping between verification/integration rows and Gherkin scenarios.
- `specs/manual-runs/VI-*/*`: AI-agent manual acceptance reports for verification, Storybook, MCP, docs, and release rows.

## Tests

- Add criterion verification tests for purely automated, hybrid, manual-only, and uncovered criteria.
- Add level verification tests that prove aggregate summaries do not hide failing or uncovered rows.
- Add Storybook integration tests for inspect, drive, run, and verify paths.
- Add MCP smoke tests for read-only lookup, driver actions, and verification calls.
- Add docs build checks and skill regression review as part of release readiness.
- Add cross-surface parity tests so CLI JSON and MCP tool payloads stay aligned.
- Add traceability from those tests back to `specs/gherkin/09-cli-verify.feature` through `12-docs-and-release.feature`.
- Add AI-agent manual run reports based on the same feature files before marking rows complete.
- Use `npm run standards` as the closing gate for every completed row.

## Review Checklist

[✓] Have all outstanding questions been answered?
[✓] Are there any ambiguities that need to be resolved?
