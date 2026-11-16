# Next Major Release: Core Package Decomposition

This release note documents the architectural decomposition of `@a11ied/core` into 6 single-job workspace packages as completed in epic `a11ied-proof-9uz.3` (`9uz.3.1`, `9uz.3.2`, `9uz.3.3`, `9uz.3.4`).

## Overview

Previously, `@a11ied/core` served as a monolithic library coupling WCAG knowledge heuristics, browser observation pipelines, verdict evaluation engines, report generation, screen reader automation, and interactive review coordination.

In this transition milestone, the monolith has been decomposed into six focused, single-responsibility workspace packages, while maintaining 100% backward-compatible re-export shims in `@a11ied/core`. In the upcoming `v1.0.0` major release, `@a11ied/core` shims will be deprecated and removed in favor of direct package imports.

## The 6 Decomposed Packages

1. **`@a11ied/knowledge`** (`0.1.0`)
   - **Responsibility**: WCAG knowledge base queries, criterion and technique lookup, page signal scanning, and HTML relevance inference.
   - **Exports**: `inferRelevantCriteriaFromHtml`, `scanHtmlForPageSignals`, and `@a11ied/wcag-engine` query delegates.
   - **Dependencies**: `@a11ied/contracts`, `@a11ied/wcag-engine`, `jsdom`.

2. **`@a11ied/observe`** (`0.1.0`)
   - **Responsibility**: Headless browser state observation, CDP instrumentation, layout & contrast sampling, virtual screen reader ariaSnapshot tree crawling, and content-addressed cache storage.
   - **Exports**: `observeState`, `observeTargetsInParallel`, `samplePageContrast`, `collectVirtualSrSummary`, `parseAriaSnapshot`, `collectPageFacts`, atomic file store primitives (`writeAtomic`, `withPathLock`, `withDirectoryCommit`), and cache utilities (`computeObservationFingerprint`, `readCachedObservationBundle`, `writeCachedObservationBundle`).
   - **Dependencies**: `@a11ied/contracts`, `@a11ied/knowledge`, `axe-core`, `playwright`, `proper-lockfile`, `zod`.

3. **`@a11ied/verdict`** (`0.1.0`)
   - **Responsibility**: Pure evaluation engine, verdict record storage, template deduplication, priority queues, inapplicability rules, and procedure catalog resolution.
   - **Exports**: `scoreObservationBundle`, `recordVerdict`, `readVerdicts`, `computePageVerdicts`, `createBundleRef`, `recordBundleVerdicts`, `generateStateObligations`, `compareClaimableWork`, `getCriterionImpact`, `verifyBundleInapplicability`, `resolveEvidenceProcedure`, `CliUsageError`.
   - **Dependencies**: `@a11ied/contracts`, `@a11ied/knowledge`, `@a11ied/observe`, `@a11ied/wcag-engine`.

4. **`@a11ied/report`** (`0.1.0`)
   - **Responsibility**: Audit reporting, VPAT generation, remediation roadmaps, and EARL export.
   - **Exports**: `buildVerdictAuditReport`, `writeVerdictAuditReportFiles`, `formatVpatMarkdown`, `buildVpatRows`, `generateRemediationRoadmapReport`, and re-exports from `@a11ied/earl`.
   - **Dependencies**: `@a11ied/contracts`, `@a11ied/earl`, `@a11ied/observe`, `@a11ied/verdict`.

5. **`@a11ied/screen-reader`** (`0.1.0`)
   - **Responsibility**: Screen reader automation abstractions, action verb registries, matchers, and driver session management.
   - **Exports**: Re-exports all `@a11ied/guidepup` APIs, plus `buildMcpSrActionDescription` and `buildMcpSrSessionDescription`.
   - **Dependencies**: `@a11ied/contracts`, `@a11ied/guidepup`.

6. **`@a11ied/review`** (`0.1.0`)
   - **Responsibility**: High-level orchestrator for interactive and autonomous human-in-the-loop accessibility review runs (`start`, `next`, `judge`, `observe`, `report`, `status`, `run`).
   - **Exports**: `review`, `REVIEW_OPERATIONS`, `getReviewRunPath`, `readReviewRunState`, `writeReviewRunState`, and all review domain types (`ReviewRunState`, `ActionableReviewItem`, `JudgeVerdictInput`, etc.).
   - **Dependencies**: `@a11ied/contracts`, `@a11ied/knowledge`, `@a11ied/observe`, `@a11ied/report`, `@a11ied/screen-reader`, `@a11ied/verdict`, `@a11ied/wcag-engine`.

## Dependency Architecture (Acyclic Workspace DAG)

The workspace dependency graph is strictly acyclic:

```
@a11ied/contracts
  ├── @a11ied/wcag-data
  │     └── @a11ied/wcag-engine
  │           ├── @a11ied/knowledge
  │           │     ├── @a11ied/observe
  │           │     │     ├── @a11ied/verdict
  │           │     │     │     └── @a11ied/report
  │           │     │     └── @a11ied/report
  │           │     └── @a11ied/verdict
  │           └── @a11ied/verdict
  ├── @a11ied/earl
  │     └── @a11ied/report
  └── @a11ied/guidepup
        └── @a11ied/screen-reader

@a11ied/review depends on:
  - @a11ied/contracts
  - @a11ied/knowledge
  - @a11ied/observe
  - @a11ied/verdict
  - @a11ied/report
  - @a11ied/screen-reader
  - @a11ied/wcag-engine

Consumers:
  - @a11ied/core (compatibility shims aggregating all packages)
  - @a11ied/mcp-server (imports directly from @a11ied/review)
  - a11ied (CLI package, imports directly from @a11ied/review)
```

No package in the DAG imports internal source files from a sibling package (`@a11ied/*/src/*` and relative `../../<pkg>/src/*` are strictly forbidden and enforced by CI test suites).

## Consumer migration

The facade contracts can change without backwards compatibility requirements.
Existing `@a11ied/core` re-exports support current internal imports; they do not promise
support for superseded assessment formats. Migrate consumers to the specialized packages
when changing those areas, and remove unused re-exports alongside that migration.
Historical audit records remain preserved as artifacts, but must pass current evidence
admission before they affect coverage or final reports.

The six extracted packages explicitly ship their compiled `dist/` directories. The pack
check, isolated-install test and publish workflow include all fourteen public packages
in dependency order. Package publication remains a separate release action.
