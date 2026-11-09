# Capabilities review and target design

Date: 2026-11-09. Goal restated without loyalty to any current component:

> Complete WCAG 2.2 AA reviews that are programmatic where confidence is 100%, agent-driven where judgment is required, and never claim a pass the evidence cannot support.

Measure: a full-site AA review finishes in minutes, its verdict is traceable per criterion, and an agent knows the next action without reading 600 lines of skill text.

## What the project actually provides today

| Capability    | Where                                                                                                       | What it really does                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Knowledge     | `packages/wcag-data`, `packages/wcag-engine`                                                                | Pinned WCAG 2.2 criteria, techniques, Understanding, ACT, axe rules, mobile guidance, APG patterns, search, `getTestMethod` + `strategy` with 55 curated desktop procedures |
| Scanner       | `core/src/axe/{scan,runtime,verdict}.ts`                                                                    | axe-core in Playwright, rule selection by criterion/level, verdict with `failOn`/baseline, SARIF/EARL output                                                                |
| Tree + DOM    | `core/src/tree/{parse,runtime}.ts`                                                                          | `ariaSnapshot` YAML + filter/serialize, HTML/title fetch                                                                                                                    |
| Detection     | `core/src/relevance`, `core/src/browser/shared-browser.ts`                                                  | Target resolution (URL/file/html), page signals, browser launch policy                                                                                                      |
| Probes        | `core/src/audit/probe/*`                                                                                    | 55 heuristic probes over page facts (counts, regexes, geometry, tab walk) that emit `passed`/`failed`/`cantTell`/`inapplicable`                                             |
| Coordinator   | `core/src/audit/run-{obligations,lifecycle,state,status}.ts`                                                | Durable run, 46 state + 5 site + 4 journey obligations, one-at-a-time claims, evidence acceptance, finalize gate                                                            |
| Evidence      | `core/src/evidence/*`                                                                                       | Provenance (run/check/attempt/state), 7 artifact kinds, SHA-256, envelope validation, JSONL store                                                                           |
| Screen reader | `packages/guidepup`, `core/src/driver/*`                                                                    | VoiceOver/NVDA/virtual adapters, broker session, portable commands, transcript, recording, desktop lease, queued API                                                        |
| Test APIs     | `packages/cli/src/test`, `src/vitest`                                                                       | `a11ied/test` (runner-agnostic), `a11ied/vitest` (fixture + matchers `toHaveSpoken`, `toHaveCursorOn`)                                                                      |
| Discovery     | `core/src/discovery/*`                                                                                      | Sitemap + same-origin crawl into `inventory.json`, page IDs, templates, storage state                                                                                       |
| Report        | `core/src/report/*`, `packages/earl`, `axe/{sarif,earl}`                                                    | HTML/PDF bundle, EARL JSON-LD, aggregates, manifests, draft/final gate                                                                                                      |
| Interfaces    | `packages/cli` (`a1`, ~40 commands), `packages/mcp-server` (24 tools), TS re-exports in `core/src/index.ts` | Every core function is reachable via CLI, MCP, and direct import                                                                                                            |
| Agent skills  | `packages/skills/{a11ied,full-site-audit}`                                                                  | 690 lines total: dev loop + full assessment loop + evidence contract                                                                                                        |
| Conformance   | `packages/act-conformance`                                                                                  | Runs a11ied against W3C ACT cases (not published)                                                                                                                           |
| Docs/doctor   | `packages/docs`, `core/src/doctor/*`                                                                        | Setup checks, quickstart, reference                                                                                                                                         |

Total core is ~34k LOC across `audit`, `driver`, `evidence`, `report`, `axe`, `apg`, `discovery`, `wcag`, `targets`, `tree`, `doctor`. It is the only package most of the others depend on.

## Where the shape fights the goal

### 1. There is no confidence model, so "100% programmatic" cannot happen

The test-method summary lists 0 automated criteria. `axe_scan` is generated and then filtered out of the obligation catalog (`run-obligations.ts`). No component has the type to say "this judgment is deterministic." Every outcome is the same `passed`/`failed`/`cantTell`/`inapplicable`, whether it came from axe, a regex, or an agent paragraph. The goal's central distinction is unrepresentable.

### 2. Three verdict engines write to three unrelated stores

- Axe writes `AxeVerdict` (exit 4 + SARIF/EARL), consumed by CI and the single-page `audit` command.
- Probes write `Judgement` and record evidence as `a1 audit probe`, which the skill declares diagnostic-only.
- The coordinator writes `AssessmentCheck` + `EvidenceRecord` with provenance, consumed by `report build`.

The report merges scanner + recorded judgments (`buildAuditReport`), but the coordinator never consumes probe facts and the probe never consumes coordinator state. Work is duplicated because the verdicts do not meet.

### 3. Booking, not review, is the bottleneck

The coordinator generates 46 obligations per state (1,297 checks for 28 states in the saved fireside run). Each requires status pagination, claim, state restore, hand-built artifact envelopes with exact provenance mirroring, registration, record, and evaluate. Validation checks file correlation, not judgment (`run-state-and-decisions.md` says so). Most agent turns satisfy the validator.

### 4. The observation layer loads each page 6+ times

`PageEvidenceCache` loads facts and axe in separate browser pages; `collectPageFacts` reloads for skip link and three viewports; each claimed check captures a fresh screenshot in a new context. There is no shared observation bundle, so 46 criteria re-observe the same DOM.

### 5. Screen reader infrastructure is a platform, not a feature

Broker, sessions, desktop leases, guarded input, transcripts, recording, tailing, batching, and two test APIs (queued + vitest) serve a general SR-automation product. For AA review the needed surface is small: start a (usually virtual) reader, walk, goto, expect a phrase, stop. The broker exists to keep a real VoiceOver session alive across CLI invocations — necessary for native readers, irrelevant for headless review, yet it shapes every MCP tool.

### 6. Knowledge is inert during execution

Procedures carry 1–2 sentences of `actions` ("Measure text/background contrast...") with no tool call, selector, or expected artifact. `wcag show` prints text and a URL. The agent translates prose into browser/SR operations, then into envelope JSON. Knowledge informs the agent's reading, never its next call.

### 7. Interfaces multiply without adding capability

The single-page scan is `a1 audit`, `audit` MCP tool, and `buildAuditReport` in core. The coordinator is `audit run/next/...`, `audit_assessment` MCP tool, and `executeAuditAssessment`. Evidence is `audit record`, `record_result`, and `recordEvidence`. Every layer is a pass-through with slightly different names (`drive`/`sr`/`driver_session`). There are 24 MCP tools where review needs roughly eight.

### 8. No incrementality, ordering, or measurement

Changes revoke proof by fingerprint, but there is no content-addressed cache to reuse unchanged pages, no severity ordering, no early verdict, and no per-criterion timing or accuracy tracking. The ACT conformance harness exists but its results do not feed back into procedure confidence.

## How it should be designed

### Principles

1. **Deterministic first, agent second, human last.** Every criterion declares its confidence tier up front. Tier-0 verdicts close without an agent.
2. **One verdict per criterion per state.** All engines write to the same store with the same shape.
3. **Observe once, judge many times.** One browser pass produces the observation bundle that all criteria and the agent share.
4. **The agent is a checklist executor, not a filing clerk.** It executes named tool calls and judges; it never hand-builds provenance.
5. **Reports are a view, not a system.** No report-only state; publication is staging + rename of the verdict store.
6. **Losing work is a bug.** Any change that can be reused is reused (cache by content hash, template grouping, diff re-runs).

### Target architecture

```
knowledge (pure data, no I/O)
  wcag-data + wcag-engine: criteria, techniques, Understanding, ACT, axe maps, procedures
  -> procedure registry: per criterion { tier, toolCalls: [tool, input, expect], failure objects }

observe (one pass per URL/state, content-addressed cache)
  browser page -> axe + tree + DOM facts + probes + screenshots + SR transcript (optional)
  -> ObservationBundle { url, fingerprint, axe, tree, facts, screenshots, transcript? }

verdict engine (deterministic, no agent)
  Tier-0: axe violations + DOM facts with 100% precision (lang, title, name, contrast)
  Tier-1: tree/keyboard/viewport analysis (structure, order, reflow, targets)
  -> Verdict[] { criterion, state, outcome, tier, confidence, evidenceRef, repro }

agent loop (thin, 8 tools)
  review.start(scope) -> review.next() -> review.observe() -> review.judge()
  review.status() -> review.report()
  (sr_session, tree, axe are internal to observe, not exposed)

persistence (one layer, from the unified file-governance plan)
  verdict store + observation cache, single lock, single atomic write, single append
  -> run dir: verdicts.jsonl + cache/<fingerprint>/ + artifacts/

presentation
  report bundle (HTML/PDF/EARL/SARIF) derived from verdict store
  CLI + MCP are thin adapters over review.* (one registry, generated help)
```

### The verdict object (replaces five verdict shapes)

```ts
Verdict = {
  criterionId: "1.4.3", stateId: "page-home", tier: 0|1|2|3,
  outcome: "passed"|"failed"|"inapplicable"|"cantTell",
  confidence: 0..1,               // 1.0 only for tier-0 deterministic rules
  method: "programmatic"|"agent"|"human",
  evidence: ObservationRef[],      // bundle keys, not hand-built envelopes
  repro: string,                   // selector/URL/fingerprint to reproduce
  nextAction?: string               // for tier-2/3 only
}
```

`cantTell` is allowed only with a `nextAction` naming the missing capability or authorization (the vocabulary from the done-definitions plan). Coverage is `verdicts.assessed / verdicts.total`, computed, never hand-asserted.

### Confidence tiers for the 55 A/AA criteria (illustrative)

| Tier            | Criteria                                                                                                                                    | Closes without agent                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 0 deterministic | 1.1.1 (alt-absent), 1.3.1 (landmarks/headings when DOM is authoritative), 1.4.3 (contrast), 2.4.2, 3.1.1, 4.1.2 (names), 2.4.4 (link names) | Yes — pass/fail/inapplicable from axe + DOM            |
| 1 programmatic  | 1.3.4, 1.3.5, 1.4.4, 1.4.10, 1.4.12, 2.1.1, 2.1.2, 2.4.1, 2.4.3, 2.4.7, 2.4.11, 2.5.2, 2.5.3, 2.5.8, 3.1.2, 3.2.1–3.2.3                     | Yes, backed by tree/keyboard/viewport facts            |
| 2 agent         | 1.3.2, 1.3.3, 1.4.1, 2.1.4, 2.2.2, 2.4.6, 2.5.1, 2.5.7, 3.2.4, 3.2.6, 3.3.2, 4.1.3, 1.4.13                                                  | Agent executes `toolCalls`, judges the returned bundle |
| 3 human         | 1.2.x with real media, 2.2.1 (timing), 2.5.4 (motion), 3.3.x with submission, flashes                                                       | `cantTell` + decision needed                           |

Tier-0/1 passes close the criterion; tier-0/1 failures produce a finding with a reproducible object. Only tier-2/3 occupy the agent queue.

### What happens to each current capability

| Keep (with a smaller job)                                 | Merge                                                                              | Kill                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `wcag-data` + `wcag-engine` (pure knowledge, zero I/O)    | `axe` + `tree` + probes into one `observe` bundle (single Playwright page per URL) | `audit probe` as a separate engine — probes become tier-0/1 verdict functions inside the engine |
| EARL/SARIF serializers (as report views)                  | Three `audit` entry points into one `review` runner; CLI/MCP/TS into one registry  | `run.json` + envelope ritual for deterministic verdicts (verdict store replaces it)             |
| `doctor`/`setup`                                          | Evidence tools into `review.judge` (one call)                                      | `sr_action` mega-tool; queued + vitest duplicate APIs collapse to one queued reader             |
| discovery + template grouping (as representative + smoke) | SR broker: in-process by default, broker only for real desktop readers             | Per-state full re-judgment — replaced by cache + template groups                                |
| report renderer (HTML/PDF)                                | Two skills into one skill with two generated recipes                               | File-integrity validation as the acceptance gate; replaced by verdict-schema + repro checks     |

### Persistence

One module (`files/store.ts` from the unified file-governance plan) owns locking, atomic writes, appends, and transactions. Observation cache is content-addressed (`cache/<fingerprint>/`), so unchanged pages are never re-observed and changed pages re-run only the delta. Verdicts append to `verdicts.jsonl` in the same lock order; no second evidence system survives.

### Agent interface (the whole MCP surface)

| Tool                   | Replaces                                                        | Returns                                                         |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `review.start`         | `audit run`, `audit discover`                                   | run ID, per-criterion plan (tier, toolCalls), first next action |
| `review.next`          | `audit_assessment(next)`, `audit_probe`, `list_pending_results` | one claim (or batch per state) with executable templates        |
| `review.observe`       | `run_axe`, `tree`, `sr_session`, `sr_action`, `sr_transcript`   | the cached observation bundle (or a slice)                      |
| `review.judge`         | `record_result`, `audit record`+`evaluate`                      | verdict stored; next claim                                      |
| `review.status`        | `audit_assessment(status)` (4 paginated lists)                  | actionable top-20 + coverage + per-page verdicts                |
| `review.report`        | `report_build`                                                  | bundle paths + unresolved scope                                 |
| `wcag.show` / `search` | knowledge tools (kept)                                          | criterion, techniques, Understanding, templates                 |
| `doctor`               | doctor (kept)                                                   | setup readiness                                                 |

Procedure `actions` become `toolCalls` (P1-7) so `review.next` already names `review.observe` parameters. The skill is generated from the procedure registry — no hand-written 600-line contract.

## Migration path (no big bang)

1. **Verdict store alongside the coordinator.** Deterministic engine writes `Verdict[]` from axe+DOM+tree; the coordinator reads them as pre-closed checks. No agent-facing change yet.
2. **Observation bundle.** Merge axe/tree/probes onto one page per URL; cache by fingerprint. Delete repeat loads.
3. **Procedure registry.** Rewrite the 55 procedures as tier + `toolCalls`; generate the skill and `review.next` payloads from it.
4. **Retire the ritual.** `review.judge` replaces record+evaluate; envelopes become bundle references; the unified persistence layer (already the plan of record) covers the store.
5. **Collapse interfaces.** CLI/MCP registry generation (P1-10, P2-15) reduces 24 MCP tools to the 8 above; the coordinator's remaining job is tier-2/3 queueing only.

## Risks and non-goals

- Tier-0 honesty: a deterministic pass must be _provably_ 100% precision (ACT-covered rules preferred). When in doubt, the criterion drops to tier-1 or tier-2 — never upgrade confidence to close a queue.
- Real screen readers stay opt-in. The default audit is virtual + browser; native VoiceOver/NVDA runs are a declared environment, not the product default.
- Non-goals: a general browser-automation product, a hosted audit service, new SR targets, non-A/AA levels as the default path, and any auto-remediation beyond finding text.

## Bottom line

The project today ships a knowledge library, a scanner, a screen-reader platform, a probe engine, and a booking system, and calls them one product. The goal needs a verdict engine with an observation cache and a thin agent loop. Keep the knowledge, keep the scanner/tree/SR backends as observation sources, unify everything else behind the verdict, and delete the ritual that currently consumes the review.
