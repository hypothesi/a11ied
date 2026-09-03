# [a11ied foundation and WCAG data]: Implementation Plan (v0.3.0 – 2026-04-06)

## Summary

Build the standards and engine layer first. This sub-plan turns WAI WCAG JSON, ACT mappings, Quickref taxonomy data, and axe-core metadata into a pinned local data package plus a stable engine package for lookup, search, applicability, and coverage.

## Objectives & Scope

- In scope: `packages/wcag-data`, `packages/wcag-engine`, supporting contract updates, and data validation workflows.
- In scope: source sync, normalization, provenance, coverage synthesis, lightweight search, and criterion resolution.
- In scope: stable data and engine APIs that later CLI, MCP, and verification code can consume.
- In scope: adding the root `npm run standards` command and making Gherkin-traced automation the acceptance contract for testable foundation work.
- Out of scope: low-level driver actions, Guidepup execution patterns, MCP handlers, and verification reporters.

## Assumptions & Open Questions

- Assumptions:
- WAI `wcag.json` remains the primary structured standards source for WCAG 2.2 and 2.1.
- `w3c/wcag` `act-mapping.json` and Quickref taxonomy data remain available and stable enough for build-time sync.
- A lightweight local search implementation is enough for the current corpus size.
- Open Questions:
- None at this stage. The implementation choices below are locked for the first public milestone.
- Resolved Decisions:
- `packages/wcag-data` must commit normalized generated artifacts and a provenance manifest to git. Raw fetched source files remain reproducible build inputs but are not committed.
- `packages/wcag-engine` must expose synchronous read APIs only in `v0.3.0`, because all artifacts are local and pre-generated at build time.
- Applicability heuristics must live in `packages/wcag-engine`. `packages/core` may collect target signals, but it must not own the classification rules.

## Requirements

### Functional Requirements

- FR-1: Create `packages/wcag-data` with scripts that fetch WCAG 2.2, WCAG 2.1, ACT mapping, Quickref tags, and axe-derived metadata.
- FR-2: Normalize fetched source data into one internal criterion-centered format with version and provenance metadata.
- FR-3: Generate a coverage artifact that shows, per criterion, what axe covers, what ACT covers, and where the system still needs hybrid or manual procedures.
- FR-4: Create `packages/wcag-engine` with APIs for criterion lookup, slug resolution, level listing, full-text search, applicability metadata, and coverage resolution.
- FR-5: Expand shared contracts so downstream packages can consume stable criterion, technique, failure, coverage, and applicability models.
- FR-6: Support both criterion-number lookups such as `4.1.3` and slug lookups such as `status-messages`.
- FR-7: Generate a verification-strategy artifact per criterion that names the preferred evidence mode and built-in procedure ids later verification code must use.
- FR-8: Add a root `npm run standards` script that runs the shared quality gate used by all later sub-plans.
- FR-9: Trace every testable foundation row to one or more feature files under `internal-docs/specs/gherkin/`.
- FR-10: Record automated implementation tests and AI-agent manual runs against those mapped feature files before a row can be marked complete.

### Non-Functional Requirements

- NFR-1 (Performance): Lookup and coverage queries should be effectively instant from local normalized artifacts.
- NFR-2 (Security): Sync scripts should only fetch from the approved upstream sources and should validate input shape before writing artifacts.
- NFR-3 (Privacy): No runtime command should need live network access after artifacts are synced locally.
- NFR-4 (Accessibility): Search and lookup results should be structured so downstream reporters can render them clearly for screen readers.
- NFR-5 (Observability): Every normalized artifact should preserve source URL, version, and sync timestamp metadata.
- NFR-6 (Maintainability): Artifact generation should be deterministic so diffs are reviewable.
- NFR-7 (i18n): Store human-facing strings distinctly enough that future localization or alternate language overlays remain possible.
- NFR-8 (Traceability): Every completed foundation row must identify the exact Gherkin scenarios it satisfies and where the automated and manual evidence lives.

## Architecture & Design Overview

- High-level diagram description or pseudo-diagram:

```text
upstream sources
  |
  +-- WAI wcag.json
  +-- ACT mapping
  +-- Quickref tags
  +-- axe metadata
          |
          v
  packages/wcag-data sync pipeline
          |
          v
  normalized JSON artifacts
          |
          v
  packages/wcag-engine APIs
          |
          v
  CLI / MCP / verification consumers
```

- Data flow, key interfaces, schemas, external services:
- Create a raw-source folder inside `packages/wcag-data` for fetched input files and a generated folder for normalized outputs.
- Normalize criteria into one canonical object keyed by criterion id, with fields for title, level, normative text, understanding URL, techniques, failures, quickref tags, and coverage summaries.
- Model coverage separately from criterion text so the engine can refresh coverage logic without rewriting normative source data.
- Use these exact domain enums in shared contracts:
   - `CoverageState`: `automated`, `hybrid`, `manual`, `unknown`
   - `ApplicabilityState`: `applicable`, `likely-applicable`, `not-detected`, `out-of-scope`, `unknown`
   - `WcagVersion`: `2.2`, `2.1`
- The canonical generated outputs must include:
   - `criteria.<version>.json`
   - `coverage.<version>.json`
   - `strategy.<version>.json`
   - `slug-index.<version>.json`
   - `tag-index.<version>.json`
- Provide engine APIs for:
   - `getCriterion(idOrSlug)`
   - `listCriteriaByLevel(level, version)`
   - `searchCriteria(query, options)`
   - `getCoverage(idOrSlug)`
   - `getQuickrefTags(idOrSlug)`
   - `getVerificationStrategy(idOrSlug)`
- Decisions & trade-offs:
- Prefer pinned normalized artifacts over parsing raw prose on demand.
- Prefer a straightforward JSON-backed search index over Tantivy until the corpus or ranking needs prove otherwise.
- Prefer storing both WCAG 2.1 and 2.2 data from the start so version views do not require a second data-pipeline redesign.
- Prefer one root `npm run standards` command over repeating lint, typecheck, test, and build commands independently in every acceptance step.

## Completion gate

Every row in this sub-plan is incomplete until all of the following are true:

1. The row is mapped to one or more scenarios in `internal-docs/specs/gherkin/01-wcag-data-sync.feature`, `02-wcag-engine-query.feature`, or `03-wcag-applicability.feature`.
2. Automated implementation tests exist for the mapped scenarios.
3. An AI agent has run a manual acceptance pass from the same feature file or files and recorded the run under `internal-docs/specs/manual-runs/<task-id>/`.
   If the row adds or changes any user-facing surface, that manual run must explicitly exercise the changed surface itself. Automated tests and `npm run standards` are required, but they do not count as that manual surface exercise.
4. `npm run standards` passes.

## Task Grid

| Status | ID    | Task                                                             | Priority | Depends On                                      | Acceptance Criteria                                                                                                                                        |
| ------ | ----- | ---------------------------------------------------------------- | -------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]    | FD-01 | Create `packages/wcag-data` workspace and sync layout            | H        | R-01                                            | Workspace exists with raw-source, generated, scripts, `standards` root script, mapped Gherkin coverage, AI-agent manual run, and passing standards gate    |
| [ ]    | FD-02 | Implement upstream fetchers and provenance validation            | H        | FD-01                                           | Source files are fetched, checksummed or validated, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass                        |
| [ ]    | FD-03 | Normalize WCAG, techniques, failures, and taxonomy data          | H        | FD-02                                           | Canonical criterion objects are generated for WCAG 2.2 and 2.1, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass            |
| [ ]    | FD-04 | Generate axe and ACT coverage artifacts                          | H        | FD-02, FD-03                                    | Coverage data is emitted per criterion with explicit source attribution, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass   |
| [ ]    | FD-05 | Expand contracts for WCAG and coverage domain models             | H        | FD-03, FD-04                                    | Shared schemas are stable and validated with round-trip tests, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass             |
| [ ]    | FD-06 | Implement `packages/wcag-engine` lookup and search APIs          | H        | FD-05                                           | Engine exposes criterion, level, search, and coverage queries, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass             |
| [ ]    | FD-07 | Add applicability metadata APIs and heuristics scaffold          | M        | FD-05, FD-06                                    | Engine exposes quickref tags, signal categories, and applicability inputs, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass |
| [ ]    | FD-08 | Add fixture tests, validation commands, and update workflow docs | M        | FD-01, FD-02, FD-03, FD-04, FD-05, FD-06, FD-07 | Data validation and update steps are documented, mapped Gherkin tests exist, AI-agent manual run is recorded, and standards pass                           |

## Task Details

### FD-01 - Create `packages/wcag-data` workspace and sync layout

**Goal:** Create the package skeleton and file layout that all later sync and normalization steps rely on.

**Step-by-step instructions:**

1. Create the package directory and package manifest at:

```text
packages/wcag-data/package.json
packages/wcag-data/tsconfig.json
packages/wcag-data/src/
packages/wcag-data/scripts/
packages/wcag-data/data/raw/
packages/wcag-data/data/generated/
packages/wcag-data/test/
```

2. Add workspace scripts for sync, validate, and build-friendly generation.
3. Add `.gitignore` rules so raw synced inputs stay uncommitted while generated normalized artifacts and provenance manifests stay committed.
4. Add a minimal README that explains the package purpose and update path.
5. Add the root `npm run standards` script to the workspace and define it to run the shared quality gate:

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

6. Create or update `internal-docs/specs/gherkin/traceability.md` with mappings from `FD-01` to the relevant feature scenarios.
7. Add or update the AI-agent manual-run report under `internal-docs/specs/manual-runs/FD-01/`.

### FD-02 - Implement upstream fetchers and provenance validation

**Goal:** Fetch the approved upstream sources safely and record where each artifact came from.

**Step-by-step instructions:**

1. Implement a sync script that fetches:

```text
https://www.w3.org/WAI/WCAG22/wcag.json
https://www.w3.org/WAI/WCAG21/wcag.json
https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json
https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml
```

2. Fetch the Quickref taxonomy file from the exact path above and record the upstream commit or fetch timestamp in the provenance manifest.
3. Read installed axe-core metadata locally by importing the installed `axe-core` package and deriving rule metadata from its public runtime metadata instead of scraping rule-description docs from the network.
4. Validate that each fetched artifact matches the expected top-level shape before persisting it.
5. Write provenance metadata beside each raw source file, including source URL, sync timestamp, and upstream version where available.
6. Implement automated tests for the mapped scenarios in `internal-docs/specs/gherkin/01-wcag-data-sync.feature`.
7. Run an AI-agent manual acceptance pass from the same feature file and record it under `internal-docs/specs/manual-runs/FD-02/`.
8. Verify `npm run standards` passes before closing the row.

### FD-03 - Normalize WCAG, techniques, failures, and taxonomy data

**Goal:** Turn multiple upstream shapes into one criterion-centered dataset.

**Step-by-step instructions:**

1. Define the canonical normalized criterion shape in `packages/contracts/src/`.
2. Map WCAG 2.2 and 2.1 criterion records into canonical objects keyed by criterion id.
3. Extract title, level, normative text, details, understanding links, sufficient techniques, advisory techniques when available, and known failures.
4. Store Quickref tags in both places:
   - a `tags` array on each canonical criterion object
   - a reverse `tag-index` artifact for lookup by tag
5. Emit separate generated files for:
   - criteria by version
   - criteria by level
   - slug-to-id index
   - technique index
   - failure index
   - tag index
6. Add deterministic sorting so generated diffs stay reviewable.
7. Implement automated tests for the mapped scenarios in `internal-docs/specs/gherkin/01-wcag-data-sync.feature`.
8. Run an AI-agent manual acceptance pass from the same feature file and record it under `internal-docs/specs/manual-runs/FD-03/`.
9. Verify `npm run standards` passes before closing the row.

### FD-04 - Generate axe and ACT coverage artifacts

**Goal:** Produce an honest machine-readable view of what automation covers and what it does not.

**Step-by-step instructions:**

1. Parse ACT mapping data and index rules by WCAG criterion.
2. Parse axe metadata and derive criterion coverage from rule tags and local mapping logic.
3. Emit a per-criterion coverage object with fields for:
   - `criterionId`
   - `coverageState`
   - `axeRuleIds`
   - `actRuleIds`
   - `notes`
   - `updatedAt`
4. Distinguish clearly between:
   - `automated`
   - `hybrid`
   - `manual`
   - `unknown`
5. Generate a per-criterion strategy artifact with:
   - `criterionId`
   - `preferredEvidenceMode`
   - `procedureIds`
   - `requiresRealTarget`
   - `notes`
6. Add a generated summary artifact that later docs and reporters can consume directly.
7. Implement automated tests for the mapped scenarios in `internal-docs/specs/gherkin/01-wcag-data-sync.feature`.
8. Run an AI-agent manual acceptance pass from the same feature file and record it under `internal-docs/specs/manual-runs/FD-04/`.
9. Verify `npm run standards` passes before closing the row.

### FD-05 - Expand contracts for WCAG and coverage domain models

**Goal:** Lock the shared schemas before public command handlers depend on them.

**Step-by-step instructions:**

1. Add schemas for criterion metadata, technique metadata, failure metadata, coverage entries, verification-strategy entries, applicability hints, and search results.
2. Add enum types for coverage state, applicability state, WCAG level, WCAG version, and preferred evidence mode.
3. Add helper types for id resolution so consumers can accept either canonical ids or slugs.
4. Add serializer and parser tests so artifacts round-trip through the contracts cleanly.
5. Publish only the shapes that downstream packages actually need, and keep internal transform helpers private.
6. Implement automated tests for the mapped scenarios in `internal-docs/specs/gherkin/01-wcag-data-sync.feature` and `02-wcag-engine-query.feature`.
7. Run an AI-agent manual acceptance pass from those feature files and record it under `internal-docs/specs/manual-runs/FD-05/`.
8. Verify `npm run standards` passes before closing the row.

### FD-06 - Implement `packages/wcag-engine` lookup and search APIs

**Goal:** Expose a stable read API over the normalized standards data.

**Step-by-step instructions:**

1. Create `packages/wcag-engine` and wire it to the generated artifacts from `packages/wcag-data`.
2. Implement criterion lookup by id and slug.
3. Implement level listing by WCAG version and conformance level.
4. Implement local search across titles, normative text, understanding summaries, techniques, failures, and taxonomy tags.
5. Implement coverage lookup that joins normalized coverage data to the canonical criterion object.
6. Implement verification-strategy lookup that joins preferred procedures to each criterion.
7. Add unit tests for id resolution, version filtering, and search ranking.
8. Implement automated tests for the mapped scenarios in `internal-docs/specs/gherkin/02-wcag-engine-query.feature`.
9. Run an AI-agent manual acceptance pass from that feature file and record it under `internal-docs/specs/manual-runs/FD-06/`.
10.   Verify `npm run standards` passes before closing the row.

### FD-07 - Add applicability metadata APIs and heuristics scaffold

**Goal:** Prepare the engine to support criterion applicability without tying it to a specific browser runtime yet.

**Step-by-step instructions:**

1. Define the data model for applicability inputs and outputs.
2. Expose an engine API that can take structural signals such as forms, media, dialogs, auth, live regions, drag-and-drop, and fixed overlays.
3. Map Quickref tags into first-pass applicability hints.
4. Keep the heuristics pure and testable so later browser integrations only need to supply signals.
5. Add fixtures that prove the engine can classify obvious cases without overclaiming relevance.
6. Implement automated tests for the mapped scenarios in `internal-docs/specs/gherkin/03-wcag-applicability.feature`.
7. Run an AI-agent manual acceptance pass from that feature file and record it under `internal-docs/specs/manual-runs/FD-07/`.
8. Verify `npm run standards` passes before closing the row.

### FD-08 - Add fixture tests, validation commands, and update workflow docs

**Goal:** Make standards-data maintenance boring and repeatable.

**Step-by-step instructions:**

1. Add fixtures that validate criterion counts, known ids, slug resolution, and source metadata.
2. Add regression tests for representative criteria such as `1.3.1`, `2.4.3`, `3.3.8`, and `4.1.3`.
3. Document the update workflow in the package README and root docs.
4. Add a repeatable standards command:

```sh
npm run standards
```

5. Add `internal-docs/specs/gherkin/traceability.md` entries for all rows in this sub-plan.
6. Run AI-agent manual acceptance passes from the mapped feature files and store them under `internal-docs/specs/manual-runs/FD-08/`.
7. Add CI hooks later in sub-plan 3, but ensure this package already has the scripts those checks will call.
8. Verify `npm run standards` passes before closing the row.

## New Code

- `package.json`: root `standards` script used as the universal completion gate.
- `packages/wcag-data/package.json`: workspace manifest and sync scripts.
- `packages/wcag-data/scripts/*`: source fetchers, validators, and normalizers.
- `packages/wcag-data/data/raw/*`: raw upstream artifacts written by the sync step and ignored by git.
- `packages/wcag-data/data/generated/*`: normalized WCAG, coverage, and search artifacts.
- `packages/wcag-data/test/*`: source and artifact validation tests.
- `packages/wcag-engine/package.json`: engine workspace manifest.
- `packages/wcag-engine/src/*`: criterion lookup, search, coverage, verification-strategy, and applicability APIs.
- `packages/contracts/src/*`: expanded WCAG and coverage schemas.
- `internal-docs/specs/gherkin/traceability.md`: mapping between foundation tasks and Gherkin scenarios.
- `internal-docs/specs/manual-runs/FD-*/*`: AI-agent manual acceptance reports for foundation rows.

## Tests

- Add fixture tests for known criterion ids, levels, titles, and slug mappings.
- Add artifact validation tests for source provenance and deterministic output ordering.
- Add coverage tests that compare representative ACT and axe mappings to expected criterion ids.
- Add search tests that prove relevant queries such as `"status message"` and `"focus order"` rank the right criteria highly.
- Add contract round-trip tests for normalized criteria, coverage entries, and applicability input shapes.
- Add verification-strategy tests that prove representative criteria map to the intended preferred procedure ids.
- Add traceability from those tests back to `internal-docs/specs/gherkin/01-wcag-data-sync.feature`, `02-wcag-engine-query.feature`, and `03-wcag-applicability.feature`.
- Add AI-agent manual run reports based on the same feature files before marking rows complete.
- Use `npm run standards` as the closing gate for every completed row.

## Review Checklist

[✓] Have all outstanding questions been answered?
[✓] Are there any ambiguities that need to be resolved?
