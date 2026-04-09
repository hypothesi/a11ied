# [a11ied roadmap]: Implementation Plan (v0.3.0 – 2026-04-06)

## Summary

Break the original single plan into a staged roadmap with three focused sub-plans. Use the roadmap to sequence work and use the sub-plans to carry the actual implementation detail for WCAG data and engine work, CLI and driver work, and verification plus adoption work.

## Objectives & Scope

- In scope: define a master roadmap that sequences the `a11ied` build into coherent implementation slices.
- In scope: split the work into sub-plans with tighter scopes, clearer dependencies, and more detailed task steps.
- In scope: preserve one shared architecture across CLI, MCP, Storybook, docs, and the Agent Skill.
- In scope: keep low-level accessibility-driver work explicit rather than burying it inside higher-level WCAG verification tasks.
- In scope: make `specs/gherkin/` the acceptance source of truth for testable behavior and require implementation traceability back to those feature files.
- Out of scope: replacing the research files, changing the product direction, or implementing the planned packages in this document-only pass.

## Assumptions & Open Questions

- Assumptions:
- The existing monorepo scaffold, research notes, and initial plan remain the baseline.
- The project should still prioritize WCAG 2.2 while keeping a path open for WCAG 2.1 views.
- The roadmap should stay small enough to scan quickly, while the sub-plans hold the execution detail.
- Open Questions:
- None at this stage. The roadmap resolves the release-shape decisions below so downstream implementation can proceed without policy gaps.
- Resolved Decisions:
- The first public milestone bundles sub-plan 1, sub-plan 2, and sub-plan 3 into one release line, `v0.3.0`.
- Partially implemented surfaces may land behind explicit `experimental` flags or hidden commands on main, but no surface is considered public until its sub-plan acceptance criteria are met.

## Requirements

### Functional Requirements

- FR-1: The roadmap must split the program into sub-plans that can be executed with minimal ambiguity.
- FR-2: The roadmap must define dependencies between sub-plans so package and interface ordering stay stable.
- FR-3: The roadmap must keep CLI, MCP, Storybook, docs, and skill work tied to one shared runtime model.
- FR-4: The roadmap must treat low-level accessibility-driver work as a first-class deliverable.
- FR-5: The roadmap must point to the detailed sub-plan document for each implementation slice.
- FR-6: The roadmap must require every testable implementation item to map to one or more feature files under `specs/gherkin/`.
- FR-7: The roadmap must require automated implementation tests for the mapped Gherkin scenarios before an implementation item can be marked complete.
- FR-8: The roadmap must require at least one AI-agent manual run based on the same mapped Gherkin scenarios before an implementation item can be marked complete.
- FR-9: The roadmap must require `npm run standards` to pass before any implementation item can be marked complete.

### Non-Functional Requirements

- NFR-1 (Performance): Plan structure should minimize context switching and reduce rereading for future implementation passes.
- NFR-2 (Security): The roadmap should call out where side-effectful work enters the system, especially driver and MCP actions.
- NFR-3 (Accessibility): The roadmap and sub-plans should stay readable in plain markdown and work well with screen readers.
- NFR-4 (Observability): Each sub-plan should define acceptance criteria and tests clearly enough to support milestone reviews.
- NFR-5 (Maintainability): The roadmap should be easy to revise as milestones move without rewriting every detailed task.
- NFR-6 (i18n): Human-facing command output should remain structured for future localization work even though the plans are in English.
- NFR-7 (Traceability): Every completed implementation item must identify the exact Gherkin feature files and scenarios covered by its automated tests and manual AI-agent run.

## Architecture & Design Overview

- High-level diagram description or pseudo-diagram:

```text
roadmap
  |
  +-- sub-plan 1: foundation and WCAG data
  |
  +-- sub-plan 2: CLI, driver, and execution
  |
  +-- sub-plan 3: verification, integrations, and adoption
```

- Data flow, key interfaces, schemas, external services:
- Sub-plan 1 owns `packages/wcag-data`, `packages/wcag-engine`, normalized artifacts, lookup, search, and coverage resolution.
- Sub-plan 2 owns the public CLI surface for `wcag`, `inspect`, `drive`, and `run`, plus low-level accessibility-driver sessions and reusable execution patterns.
- Sub-plan 3 owns verification orchestration, Storybook bridging, MCP tools and resources, docs, skill guidance, CI hardening, and release framing.
- The shared contracts package sits underneath all three sub-plans and should only change in controlled, reviewed steps.
- Decisions & trade-offs:
- Prefer one roadmap plus multiple sub-plans over one giant plan that mixes package design, CLI UX, verification logic, and release work in the same task list.
- Prefer sequencing work so data and contracts land before CLI and verification code start depending on unstable shapes.
- Prefer separate adoption work instead of scattering docs and skill tasks across every technical slice.
- Prefer one shared `npm run standards` gate over ad hoc per-task shell commands so completion checks stay consistent.

## Completion gate

This gate applies to every implementation row in sub-plan 1, sub-plan 2, and sub-plan 3. A row is not complete until all of the following are true:

1. The relevant scenarios in `specs/gherkin/*.feature` are identified and traced to the task.
2. Automated implementation tests exist for those scenarios.
3. An AI agent has executed a manual test directly from the same feature file or files and recorded the run.
   If the task adds or changes any user-facing surface, that manual run must explicitly exercise the built surface itself. Running automated tests or `npm run standards` does not satisfy this requirement by itself.
4. `npm run standards` passes after the implementation and tests land.

The recommended manual-run artifact path is:

```text
specs/manual-runs/<task-id>/<yyyy-mm-dd>-<agent>.md
```

The recommended traceability artifact path is:

```text
specs/gherkin/traceability.md
```

## Task Grid

| Status | ID   | Task                                                         | Priority | Depends On       | Acceptance Criteria                                                                        |
| ------ | ---- | ------------------------------------------------------------ | -------- | ---------------- | ------------------------------------------------------------------------------------------ |
| [✓]    | R-01 | Establish scaffold and research baseline                     | H        | —                | Monorepo, research notes, and initial design direction exist and are verified              |
| [ ]    | R-02 | Execute sub-plan 1: foundation and WCAG data                 | H        | R-01             | WCAG source sync, coverage artifacts, contracts, and engine APIs are stable                |
| [ ]    | R-03 | Execute sub-plan 2: CLI, driver, and execution               | H        | R-02             | CLI surfaces and driver primitives work against the stable engine contracts                |
| [ ]    | R-04 | Execute sub-plan 3: verification, integrations, and adoption | H        | R-02, R-03       | Verification, Storybook, MCP, docs, and release readiness are wired to the same runtime    |
| [ ]    | R-05 | Run cross-plan integration and milestone review              | M        | R-02, R-03, R-04 | The combined system passes smoke tests and the roadmap can close with clear residual risks |

## Task Details

### R-01 - Establish scaffold and research baseline

**Goal:** Start sub-plan work from a stable scaffold and a documented product direction.

**Step-by-step instructions:**

1. Keep the existing monorepo scaffold and research notes as the prerequisite baseline.
2. Treat the current workspace verification commands as the baseline regression check:

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

3. Use the research files in `research/` and the skill file in `skills/a11ied/SKILL.md` as the source material for the sub-plans.
4. Do not begin implementation work for sub-plan 2 or sub-plan 3 until sub-plan 1 has locked the shared contracts that they consume.

### R-02 - Execute sub-plan 1: foundation and WCAG data

**Goal:** Build the local standards and engine layer that every other surface depends on.

**Step-by-step instructions:**

1. Open and execute [plans/a11ied-foundation-and-wcag-data-plan.md](plans/a11ied-foundation-and-wcag-data-plan.md).
2. Finish the data sync pipeline before exposing public WCAG lookup commands.
3. Freeze criterion, coverage, applicability, and verification-strategy schemas before driver, CLI, or MCP code starts depending on them.
4. Introduce the root `npm run standards` script in this sub-plan and use it as the universal completion gate from that point forward.
5. Require passing data validation, schema tests, mapped Gherkin automation, mapped AI-agent manual runs, and `npm run standards` before marking the sub-plan complete.

### R-03 - Execute sub-plan 2: CLI, driver, and execution

**Goal:** Expose the product surface that humans and agents will actually use day to day.

**Step-by-step instructions:**

1. Open and execute [plans/a11ied-cli-driver-and-execution-plan.md](plans/a11ied-cli-driver-and-execution-plan.md).
2. Implement CLI UX only after the WCAG data and engine contracts are stable.
3. Build low-level driver primitives first, then build higher-level reusable patterns on top of them.
4. Keep CLI JSON output aligned with the same contracts that later power MCP and verification.
5. Do not mark any CLI, driver, or execution row complete until its mapped Gherkin scenarios have both automated coverage and an AI-agent manual run, and `npm run standards` passes.

### R-04 - Execute sub-plan 3: verification, integrations, and adoption

**Goal:** Turn execution evidence into WCAG-aware verdicts and make the system usable across the repo surfaces.

**Step-by-step instructions:**

1. Open and execute [plans/a11ied-verification-integrations-and-adoption-plan.md](plans/a11ied-verification-integrations-and-adoption-plan.md).
2. Reuse the contracts and driver layer from the earlier sub-plans instead of inventing integration-specific shapes.
3. Keep criterion-level evidence explicit so level-based verification never hides uncovered or manual-only criteria.
4. Finish docs, skill, MCP, and Storybook work against the same reporting model.
5. Do not mark any verification, Storybook, MCP, docs, or release row complete until its mapped Gherkin scenarios have both automated coverage and an AI-agent manual run, and `npm run standards` passes.

### R-05 - Run cross-plan integration and milestone review

**Goal:** Prove the sub-plans add up to one coherent product instead of three disconnected slices.

**Step-by-step instructions:**

1. Run the full workspace verification suite:

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

2. Run at least one smoke path for each major surface:
   - CLI WCAG lookup
   - CLI driver action
   - CLI verification flow
   - Storybook target resolution
   - MCP tool invocation
3. Verify that every completed implementation row in the sub-plans links to automated tests and an AI-agent manual run based on the mapped Gherkin features.
4. Run `npm run standards`.
5. Compare the implemented behavior against the acceptance criteria in all three sub-plans.
6. Record unresolved issues, deferred features, and release blockers before cutting a milestone.

## New Code

- `plans/a11ied-cli-implementation-plan.md`: master roadmap that sequences the work and points to detailed sub-plans.
- `plans/a11ied-foundation-and-wcag-data-plan.md`: detailed plan for data sync, normalization, contracts, and the WCAG engine.
- `plans/a11ied-cli-driver-and-execution-plan.md`: detailed plan for CLI UX, driver primitives, and reusable execution procedures.
- `plans/a11ied-verification-integrations-and-adoption-plan.md`: detailed plan for verification, Storybook, MCP, docs, skill, and release readiness.
- `specs/gherkin/traceability.md`: task-to-feature traceability matrix used to prove completion gates.
- `specs/manual-runs/*`: AI-agent manual acceptance reports tied to the same feature files as the automated tests.

## Tests

- Re-run the workspace baseline checks after changing the plan structure.
- Review each sub-plan task grid to confirm every roadmap row points at one detailed execution document.
- Verify the roadmap dependencies do not allow CLI or verification work to outrun the shared contracts and WCAG engine work.
- Verify that the sub-plans define Gherkin traceability, automated implementation tests, AI-agent manual runs, and `npm run standards` as completion gates.

## Review Checklist

[✓] Have all outstanding questions been answered?
[✓] Are there any ambiguities that need to be resolved?
