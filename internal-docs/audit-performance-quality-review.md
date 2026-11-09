# Audit performance and quality review

Date: 2026-11-09. Scope: the full AA assessment workflow — coordinator, probes, axe, screen reader, evidence, MCP, skills, and CLI — measured against the stated purpose:

> Complete automated a11y reviews to WCAG AA, programmatic where confidence is 100%, agent-driven otherwise.

Every claim below was checked against the code or the saved fireside run. File references are to the current tree.

## Verdict in one paragraph

The project has two separate review engines that do not meet. The coordinator (`packages/core/src/audit/run-*`) generates one agent obligation per state-scoped procedure (46 per state, 55 total for A+AA) and requires the agent to perform, artifact, and prove each one serially. The probe runner (`packages/core/src/audit/probe/*`) does cover all 55 criteria programmatically, but the skill declares it a development diagnostic that "does not establish" production coverage, so its verdicts cannot finish the audit. The test-method data confirms the gap: 0 criteria are `automated`, 36 are `hybrid`, 50 are `manual`. There is no 100%-programmatic lane. The result is a combinatorial workload (1,297 checks for 28 states in the saved fireside run), an evidence ritual that consumes most agent turns, and a definition of done an agent cannot infer from any single screen. Speed, quality, and clarity fail for the same reason: the coordinator optimizes for provability of process, not for a finished AA verdict.

## What exists today

| Layer         | What it does                                                                                          | Where                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Knowledge     | Pinned WCAG 2.2 criteria, techniques, Understanding, ACT/axe mappings, 55 curated desktop procedures  | `packages/wcag-data`, `packages/wcag-engine/src/artifacts/runtime.ts`         |
| Scanner       | axe-core against mapped rules, verdict with `failOn`/baseline, exit 4 on violation                    | `packages/core/src/axe/{scan,runtime,verdict}.ts`                             |
| Coordinator   | Durable run, obligations, claims (`next`), state/journey registry, evidence acceptance, finalize gate | `packages/core/src/audit/run-{obligations,lifecycle,state,status}.ts`         |
| Probes        | Browser facts + per-criterion heuristics that produce `passed`/`failed`/`cantTell`/`inapplicable`     | `packages/core/src/audit/probe/probes-*.ts`, `page-facts.ts`, `judge.ts`      |
| Screen reader | One active session, `sr_action` MCP tool driving VoiceOver/NVDA/virtual                               | `packages/mcp-server/src/tools/sr-action.ts`                                  |
| Evidence      | Provenance with attempt, state revision/fingerprint, artifact hashes, finite action ranges            | `packages/core/src/evidence/{validation,artifacts}.ts`                        |
| Agent skills  | `full-site-audit` (complete assessment) and `a11ied` (dev loop)                                       | `packages/skills/full-site-audit/SKILL.md`, `packages/skills/a11ied/SKILL.md` |

The intended flow from `full-site-audit/SKILL.md` section "Perform the assessment loop" is 9 steps per obligation: status, next, restore state, perform procedure in the declared environment, judge, `audit record` with provenance, `audit evaluate`, repeat. The scanner is step zero and is explicitly not allowed to finish the work.

## Finding 1: the review is slow because the workload is combinatorial and fully serialized

### 1.1 Obligation count explodes with states, not with pages

`run-obligations.ts` builds one check per state-scoped procedure per observed state, plus one per site procedure per environment and one per journey procedure per journey. For WCAG 2.2 A+AA the catalog has 46 state, 5 site, and 4 journey procedures.

- 1 state: 46 obligations
- 24 pages, 1 state each: 1,104 state obligations
- Saved run `.a11ied/fireside-virtual-20261103/run.json`: 28 states, 1,297 checks, 1 journey

`internal-docs/current-audit-status.md` reports 246 assessed out of 1,251 obligations at revision 1027. The skill forbids sampling ("A large inventory is more work, not an implicit license to sample") and forbids template dedupe ("template similarity cannot certify pages the agent did not assess"). Every new state the agent registers re-queues 46 checks, and every state change marks affected checks `stale` (`run-state.ts` `registerAuditState`), revoking prior proof. A site with interactive states (menu open, dialog open, error state) multiplies the count beyond the page count.

### 1.2 One check at a time, no batch, no prefetch

`nextAuditAssessment` claims exactly one check and throws if any check is `running` (`run-lifecycle.ts` `selectNextCheck`). `evaluation` requires the agent to finish it before claiming another. `getQueuedChecks` sorts by target order and defers site/journey checks to the end, so the agent does dozens of per-state checks before learning a site-level failure. There is no batch claim, no parallel agent pool, no lookahead, and no priority by severity. A single slow check blocks the queue.

Per check the agent pays roughly 8–12 tool calls (status page, next, state restore, one or more `sr_action`/`tree`/`axe` calls, artifact writes, artifact registration via `audit state`, `audit record`, `audit evaluate`, status again). Status defaults to 20 items and paginates states, journeys, progress, and issues separately through `nextOffset`; the skill instructs the agent to read every page. At 1,251 obligations that is 10,000+ calls before judgment quality enters the picture.

### 1.3 Page facts are collected 6+ times per URL, then discarded per check

`probe-observe.ts` registers one state per page at 480x320. `probe-site.ts` `PageEvidenceCache` loads each URL once for facts and once more for axe (`readAxe` calls `runAxe`, which launches its own browser page). `page-facts.ts` `collectPageFacts` then performs, in order: `goto` + `networkidle`, facts script, small-targets script, CDP instrumentation, media inventory, element listeners, up to 120 Tab presses each followed by an evaluate, focus-indicator probes per candidate stop, a second `goto` for the skip link, three viewport loads for reflow/zoom/orientation, and a text-spacing pass. That is 6+ full page loads per URL. For 24 pages that is 144+ loads, all sequential, before the first obligation is judged. `buildSiteFacts` loads every page again up front.

`probe-run.ts` `runClaim` writes artifacts twice: once before registering artifact paths on the states, once after (`registerArtifactPaths` then a second `writeProbeArtifacts`). Each write includes a fresh screenshot via `captureScreenshot`, which opens a new browser context per check. A check that reuses exactly the same page facts therefore still pays a screenshot load, two artifact writes, and a file lock per state.

### 1.4 Agent context cost is dominated by ritual, not by accessibility

The two skills total about 690 lines (`full-site-audit` 207 + `run-state-and-decisions.md` 218 + `a11ied` 263). Each claimed procedure carries `setup`, `actions`, `evaluation`, `recovery`, `limitations`, `sources`, and required evidence. The evidence contract in `run-state-and-decisions.md` requires the agent to hand-build JSON envelopes that repeat provenance values exactly (run ID, attempt, state revision/fingerprint, session ID, `capturedAt`), compute SHA-256, register paths before recording, and cite all environment states for site checks. `validation.ts` rejects any drift. Most agent turns in the saved run are spent satisfying the validator, not judging WCAG.

## Finding 2: quality is poor because neither engine decides criteria with 100% confidence

### 2.1 There is no programmatic lane

`run-obligations.ts` filters out `axe_scan` from the obligation catalog. A passing axe scan therefore completes zero obligations. The test-method summary (`test-method-summary.2.2.json`) lists 0 automated criteria out of 86, so the coordinator has no criterion it may close without an agent. The skill repeats this: "Scanner success cannot establish a whole-criterion pass" (`procedures.ts` scanner procedure limitations).

Axe violations are programmatic findings, but the coordinator treats them as procedure zero. Failing axe rules can be recorded as evidence for the behavioral procedure, yet a clean scan gives the agent no head start: it must still "perform the actual procedure" and produce observation, action-trace, and (for 31 of 55 procedures) screenshot artifacts.

### 2.2 The probe catalog covers 55 criteria with shallow heuristics

`probes-perceivable.ts`, `probes-operable.ts`, and `probes-understandable.ts` implement one `Probe` per A/AA criterion. `judge.ts` delegates to an axe violation when one is tagged, except for 1.4.3. The remaining logic is counts, regexes, and geometry on the initial page load:

- 1.1.1: alt is null or matches `^(image|photo|picture|graphic)$`; unnamed buttons from `aria-label`/`textContent`/`title`.
- 1.3.1: exactly one h1, at least one main landmark, controls labelled.
- 1.3.2: any tab stop jumping backwards by more than 40px, with `left > 400`, is flagged for review.
- 1.3.3: body text (first 20,000 chars) matching `/(click|press|tap|see|use) (the )?(red|green|...)` is flagged.
- 1.3.4 / 1.4.4 / 1.4.10: horizontal overflow pixels at 800x1280, 640px, and 320px viewports.
- 2.1.2: trap suspected when distinct tab-stop IDs fall below 3.
- 2.1.4: any window/document keydown listener means "needs review".
- 2.4.3: focus jumps upward by more than 200px, needs 2+ jumps to fail.
- 2.4.5: passes with 2 of: nav links present, XML sitemap fetchable.
- 2.5.1 / 2.5.7: class names containing `slider|carousel|swiper|compare` count as gesture widgets.
- 2.5.8: targets under 24px whose 24px circle contains another target.
- 3.1.2: non-Latin script in the first 20,000 chars means "needs review".
- 4.1.3: zero live regions and zero forms means inapplicable, otherwise "needs review".

Many probes return `needsReview` (`cantTell`) as their only non-pass outcome. `cantTell` never completes the audit (`run-status.ts` treats it as unresolved). The probe runner records each `cantTell` as an evaluated check, then `recoverChecks` retries blocked/stale checks up to 3 rounds. The agent inherits a queue full of inconclusive verdicts with no ranking of what to do next.

`foldJudgements` (`probe-run.ts`) collapses multi-state results by worst outcome, with `inapplicable` mixed with any other outcome becoming `passed`. A probe that passes on 23 pages and is inapplicable on one page reports a single pass for the whole check.

### 2.3 Validation proves file integrity, not judgment

`evidence/validation.ts` and `evidence/artifacts.ts` check: identity match, attempt freshness, state order/revision/fingerprint, capability presence, artifact registration, SHA-256, capture time ordering, action ranges, and envelope mirroring. `run-state-and-decisions.md` states the limit plainly: "Validation checks correlation, but does not prove collector honesty or correct WCAG judgment." Artifact content for `observation` is any non-empty text. `probe-artifacts.ts` builds `measurement` artifacts as `value: 1 or 0` with the rationale as the method string, and `action-trace` as a synthetic checkpoint plus one row per state. The system can therefore mark evidence `verified` while the underlying judgment is a regex guess.

Because `recordEvidence` throws on any unverified provenance, the agent experiences this as "poor quality": a correct a11y observation is rejected over a hash, a timestamp, or a state citation, and the run offers no partial-credit path. The skill says "Resolve any validation rejection before proceeding", so one malformed envelope stalls the serial queue.

### 2.4 The two engines disagree on what "decided" means

The probe runner excludes procedures requiring `screen-reader`, `real-reader`, or `speech` and drains the rest. The skill then says the probe's "cached initial-page facts and diagnostic measurements do not establish restored interactive states or complete normative procedure coverage" and names `a11ied-proof-5qp` for cached-state and synthetic-measurement defects. The internal status doc calls `audit probe` "unsuitable for this production run."

An agent therefore has two truth sources: probes that claim to decide 55 criteria heuristically, and procedures that require fresh state-scoped observation per criterion. It cannot know which verdict the final report will trust without reading both the skill and the status doc.

## Finding 3: agents are unclear about the goal and the next action

### 3.1 One name, three commands

- `a1 audit <target>` — single-page scan (axe + tree + rollup). Exits 4 on axe violation. Prints `nextCommands` suggesting `sr walk`.
- `a1 audit run/state/journey/next/status/resume/evaluate/finalize` — coordinator lifecycle.
- `a1 audit probe <run>` — probe runner that claims and records checks in a browser.

All three are subcommands of `audit`. The MCP server mirrors the ambiguity: `audit` (single page), `audit_assessment` (lifecycle), `audit_probe` (batch decide). The `a11ied` skill pushes the single-page scan as the dev loop; `full-site-audit` pushes the coordinator. An agent asked for "a complete AA review" must guess which entry point the user means.

### 3.2 The procedure text is not an executable plan

Each curated procedure (`wcag-data/data/curated/desktop-procedures.json` via `procedures.ts`) provides `applicability`, 2–4 `actions` sentences, and `passed`/`failed`/`inapplicable` criteria. Example from 1.4.3: "Measure text/background contrast across states, images, gradients, and overlays; record size and weight." No tool is named. No selector, no viewport, no `sr_action` payload, no tree filter, no expected artifact content. The coordinator's `guidance` field is identical boilerplate for every check ("Execute the procedure in the declared environment, save observed evidence, then evaluate this check"). The agent must translate a 1–2 sentence human instruction into browser, screen reader, and file operations, then into provenance envelopes, with no worked example in the skill.

Evidence kinds deepen the ambiguity. The procedure lists `observation`, `action-trace`, `screenshot`, `speech`, `media`, `measurement` but the contracts define content only as "nonempty text" (observation), typed action receipts, or PNG bytes. What counts as a sufficient observation for 2.4.7 versus 1.4.3 is left to the agent, then validated only for non-emptiness.

### 3.3 The goal is "finish 1,297 obligations" not "produce a trustworthy AA verdict"

Status reports `total`, `attempted`, `assessed`, `unresolved`, plus paginated issues and progress. Completion requires zero issues and zero unresolved obligations. A run with 5 site procedures and 4 journey procedures cannot complete until every state is observed and every journey is traversed. There is no severity order, no "stop when the remaining work cannot change the verdict" rule, and no per-page verdict that is useful before the whole site finishes. The report builder (`a1 report build --draft`) can publish partial results, but the skill positions it as a preview, not as the product.

For a developer asking "is this page AA?", the available answers are: run the scan (exit 4 means axe found something), or start a 46-obligation loop and check status in a few thousand calls.

## What to change

### P0 — make the programmatic lane real, and make probes earn it

1. Promote deterministic checks out of the agent loop. Axe violations already fail deterministically. Extend `axe_scan` to a countable obligation that closes when its rules pass or are inapplicable, with the scan artifact attached. Keep the behavioral procedure only for the integer part axe does not cover. This alone removes the need for the agent to re-prove contrast, name, and structure that axe already measured.
2. Split probes into two classes in `judge.ts`: `decisive` (returns only `passed`/`failed`/`inapplicable` with a reproducible object) and `advisory` (returns `cantTell` with a next action). Only decisive probes may auto-record. Advisory probes must hand the agent a concrete tool call (e.g. `tree --role button`, `sr_action elements kind=heading`) instead of a paragraph. Today 1.4.5, 1.4.11, 1.4.13, 2.1.4, 2.5.1, 3.1.2, 3.2.2, and 4.1.3 are advisory in behavior but recorded as if decisive.
3. Fix the known probe defects before trusting any of them: `page-facts.ts` reloads the page 6+ times; cache by URL across fact, axe, and viewport phases; load once at 1280 and resize instead of navigating. `measureViewports` must run on the same loaded page. `foldJudgements` must not turn mixed `inapplicable`+other into `passed`. `2.4.5` sitemap fetch and `2.5.1` class regexes must be documented as heuristics with a human-review flag, not passes.

### P0 — cut the obligation math

4. Dedupe by template with an explicit, auditable rule. Let the agent declare a state as a representative of a template group (same nav, same footer, same component set) and record one assessment per group plus a per-page smoke check (axe + tree + spot check). The report discloses the grouping. The current "similarity cannot certify" rule forces exhaustive re-judgment of identical headers on 24 pages.
5. Prioritize by impact and allow early verdicts. Order the queue by severity (critical/serious failures first) and publish a per-page verdict after its state checks complete, instead of deferring all site and journey checks to the end. A site-level navigation failure should surface after page 1, not after 1,104 state checks.
6. Batch claims. Allow `audit next --count N` to claim N checks that share a state, so the agent pays one state-restore per state instead of one per criterion. Most state procedures (1.1.1, 1.3.1, 2.4.2, 4.1.2) read the same tree.

### P1 — make each check executable and cheap to prove

7. Rewrite procedure `actions` as tool-call templates. Each action should name the MCP/CLI call, its parameters, and the artifact content schema (e.g. `tree --role img`, expect count + names; `sr_action read-all max=200`, expect transcript slice). The agent should fill parameters, not invent methods. `run-state-and-decisions.md` already lists evidence kinds; add a content example per kind per procedure family.
8. Shrink the evidence ritual. The provenance envelope, per-state artifact registration, exact `capturedAt` mirroring, and SHA-256 recomputation catch file tampering, not a11y truth. Keep run/check/attempt/state linkage; drop the requirement that every artifact envelope repeat every provenance field and that site checks cite every state in every artifact. A single manifest hash per attempt is enough. Measure the change by validation-rejection rate, which should fall from the dominant failure mode to near zero.
9. Return one page of status, not four paginated lists. `audit status` currently requires the agent to follow `nextOffset` through states, journeys, progress, and issues. Return the next 20 actionable items (blocked with reason, next claimable, stale) and a coverage summary. The agent should never enumerate 1,251 obligations to decide what to do next.
10.   Consolidate the three `audit` entry points. Rename the single-page scan to `a1 check <target>` (the dev loop), keep `audit run/next/...` as the site coordinator, and keep `audit probe` as `audit probe` with a clear statement that its verdicts are advisory until P0.1 lands. Update both skills to use one name per job.

### P1 — fix measurement and observation quality

11. Unify facts and axe on one browser page per URL. The current design loads the page for facts, then launches a second page for axe, then a third for screenshots. Share one Playwright page with instrumentation, run facts, axe, tree, and screenshots from it, and reuse the screenshot for all checks on that state.
12. Remove the double artifact write in `probe-run.ts`. Register paths first with a placeholder, or record evidence with artifacts already registered. The current write-register-write sequence doubles I/O and screenshots for every check.
13. Parallelize distinct URLs. `observeInventoryPages` and `buildSiteFacts` are sequential loops. Page loads are independent; run them with a bounded concurrency (e.g. 4) and keep the serial queue only for the shared run file.

### P2 — reduce skill and MCP surface

14. Merge the two skills into one with two recipes inside: "check this page" (scan + tree + targeted `sr` steps) and "audit this site" (coordinator). Today the shared screen reader and evidence chapters are duplicated, and each skill carries the other skill's warnings. One skill removes the `which skill am I in` question.
15. Split `sr_action` or generate its description from the schema. The single mega-tool description lists 20+ verbs with payload shapes in prose. Agents misread it; the CLI already has per-verb help. Generate the MCP description from the same registry the CLI uses, or split into `sr_navigate`, `sr_act`, `sr_assert`.
16. Document the definition of done per outcome in the procedure itself. For `inapplicable`, name the absence that must be observed (the `media-absence` path already does this for 6 criteria; extend it). For `cantTell`, name the specific capability or authorization missing and the blocked-reason text. The skill currently tells the agent not to "fill every pending criterion with the same blocker" without giving the vocabulary.

## Appendix: key numbers and files

- 55 A/AA criteria, 55 non-scanner procedures (46 state, 5 site, 4 journey), 0 automated, 36 hybrid, 50 manual across all levels.
- Saved fireside run: 28 states, 1,297 checks, 1 journey; 246 assessed of 1,251 obligations at revision 1027.
- Probes: 55 entries across `probes-perceivable.ts` (20), `probes-operable.ts` (19), `probes-understandable.ts` (16). Most `pass` paths assert the absence of a counted problem on the initial page load.
- Evidence: 31 of 55 procedures require `screenshot`; 22 require `screen-reader` + `speech`; 7 require `media`. Every procedure requires `observation` + `action-trace`.
- Page loads per URL in the probe path: initial state screenshot, facts load, axe load, skip-link load, three viewport loads, text-spacing load, plus one screenshot per claimed check.
- Status pagination: default limit 20, max 100, four independent lists.
- Skills: `full-site-audit` 207 lines + `run-state-and-decisions.md` 218 lines + `a11ied` 263 lines.

## Suggested sequencing

Steps 1–3 (programmatic lane + probe honesty) remove the largest volume of agent work. Steps 4–6 (dedupe, priority, batching) cut the remaining obligations by an order of magnitude on multi-page sites. Step 7 (executable procedures) and step 8 (lighter evidence) remove the clarity and rejection loops that make agents appear stuck. Each step is independently shippable; together they change the product from "1,297 provable obligations" to "a fast programmatic verdict with agent judgment only where the program cannot decide."
