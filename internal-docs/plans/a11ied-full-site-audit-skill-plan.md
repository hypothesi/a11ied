# a11ied full-site accessibility audit skill: implementation plan (v0.1.0 - 2026-09-16)

## Summary

Add an Agent Skill, `full-site-audit`, that drives the `a1` CLI through a WCAG 2.2 Level
AA evidence audit of a single page, a section of a site, or an entire site. The resulting
report states what passed, failed, could not be determined, or was not tested; it never
turns incomplete evidence into a compliance claim.
The skill decides scope with the user, discovers pages (sitemap first, crawl fallback),
dedupes redirects and canonical duplicates, uses its own judgment to group pages sharing a
template so it does not retest identical layouts, offers a full-vs-sampled audit choice
above 50 pages, offers subagent parallelization for the automatable portion only, and
keeps a running inventory so an interrupted run does not repeat completed page audits.
It also writes a lessons-learned file the next audit of the
same site can read - treated as hypotheses to re-verify, never settled fact, since the
site may have changed. Two new product capabilities make this possible without inventing
per-skill logic: `a1 audit discover`, a new subcommand that turns a URL into a deduped
page inventory, and `a1 report build`, a new command that merges many pages' `a1 audit`
results into one polished HTML report, a print-ready PDF, and a merged W3C EARL 1.0
report. Per-page automated and screen-reader auditing reuses the existing `a1 audit`,
`a1 sr`, and `a1 audit record` commands; only shared authenticated page setup is added.
The report's underlying data stays
available as plain JSON/EARL so the skill can build a fully custom presentation when a
user wants one the built-in renderer does not offer.

## Objectives & scope

- In scope:
   - `a1 audit discover <url>`: sitemap-driven page discovery, a same-origin rendered crawl
     by default, SPA-aware page signals, redirect and canonical resolution, optional
     privacy-gated rendered-HTML/accessibility-tree artifacts, dedup, a synthetic 404 probe,
     resumable discovery via an existing partial inventory, and a JSON inventory file as
     the output contract. Grouping pages by shared template is an agent judgment call the
     skill makes and records, not something this command computes.
   - `a1 report build`: aggregates one discovery inventory plus N per-page
     `a1 audit --format json` results (and any recorded screen-reader evidence already
     folded into those results) into `report.html`, `report.pdf`, `report.earl.json`, and
     a complete machine-readable `report.json` render model.
   - MCP tool coverage and registry-parity-test coverage for both new commands.
   - The new Agent Skill: scope negotiation, discovery, the 50-page fork in the user's
     brief, agent-driven template review and sampling explanation, subagent-
     parallelization offer (CLI-audit portion only), screen-reader safety warnings,
     login/QA-environment awareness, destructive-action avoidance, tool-availability
     preflight, running inventory maintenance, resuming an interrupted run,
     reading and updating a per-site lessons-learned file, final report generation, and
     explicit latitude to build a custom report presentation from the report's raw data.
   - Docs site coverage for both new commands and the new skill.
   - Updating the existing `packages/skills/a11ied/SKILL.md` with one cross-reference to
     the new skill for whole-site scope, and updating the release readiness doc's agent
     skill section.
- Out of scope:
   - Any change to single-page audit judgments. This plan adds shared `--storage-state`
     page setup to discovery and `a1 audit` so both can load the same authenticated page.
   - NVDA automation from a non-Windows machine. The skill uses whatever screen reader
     `a1 doctor` reports as available on the machine it runs on.
   - Collecting a username, password, cookie, token, or header in chat or a command line.
     For automated browser work, the skill opens Playwright codegen and asks the user to
     sign in there; Playwright writes storage state to a local ignored file. For a real
     screen-reader session, the skill pauses while the user signs in inside the controlled
     browser, then continues in that same session.
   - Deliberately triggering server-side 500 errors on a live target. The 404/500 sweep
     only probes one synthetic not-found URL and audits pages that already returned 5xx
     during discovery.
   - A hosted/CI-triggered version of the audit (e.g., a GitHub Action). This plan covers
     the interactive, agent-run workflow only.
   - A CLI flag surface for report branding (logo, colors, layout). Visual customization
     is handled by giving the skill full latitude to render its own report from
     `report.json`/`report.earl.json`, not by growing `a1 report build`'s option list
     speculatively.
   - Byte-exact resumption of a partially-completed crawl's link-discovery frontier. Crawl
     fallback resumes by re-running and skipping URLs the existing inventory already
     resolved, not by persisting the crawl queue itself (see Architecture & design
     overview for why).
   - A distributed lock. One coordinator owns `inventory.json`; parallel workers write only
     their own `pages/<pageId>/audit.json` file and return completion to the coordinator.

## Assumptions & open questions

- Assumptions:
   - `packages/skills/full-site-audit/` is a new, second skill bundle, separate from
     `packages/skills/a11ied/`, because the two have different audiences: the existing
     skill is a component-level dev loop, this one is a whole-site evidence audit.
     Splitting keeps each `SKILL.md` under the spec's ~500-line/~5000-token guidance
     instead of merging two workflows into one oversized file.
   - `a1 audit discover` is a subcommand of `a1 audit` (`a1 audit discover <url>`), not a
     flag on `a1 audit <target>` itself and not a new top-level command. `audit` already
     takes a single target and already nests subcommands (`record`, `pending`, `clear`)
     for actions that are not "run one audit against one target"; `discover` fits that
     same slot, and a flag would have conflicted with `audit`'s existing single-target
     contract.
   - Sitemap and robots.txt fetching, and the synthetic 404 probe, use Playwright's
     timeout-bounded request context so an optional storage-state file applies consistently.
   - XML sitemap parsing uses `jsdom`, already a dependency of `packages/core` and
     `packages/guidepup`, in its XML content-type mode. No new XML dependency.
   - Crawl-fallback link discovery and PDF rendering both reuse `playwright`, already a
     dependency of `packages/core`, and the existing Chromium-preferring launch policy in
     `packages/core/src/browser/policy.ts`. No new browser-automation or PDF dependency.
   - Grouping pages by shared template is explicitly non-programmatic: `a1 audit discover`
     does not compute or assign a template grouping. It captures enough signal per page
     (URL path, page title, first heading text) for an agent to judge the grouping itself,
     and the skill records that judgment back into the inventory file directly (it is
     plain JSON; no new command is needed to write to it). This keeps the "intelligent,
     sampled" audit mode driven by real page-structure understanding instead of a
     brittle heuristic guessing at it.
   - Per-run artifacts (inventory, per-page results, optional page snapshots,
     screen-reader evidence,
     the final report bundle) live under `.a11ied/audits/<timestamp>-<origin-key>/`, overridable
     via each underlying command's own `--out`/`--out-dir` flag. The lessons-learned file
     lives one level up, at `.a11ied/sites/<origin-key>/hints.json`, keyed by normalized
     origin rather than by
     run, because a lesson learned auditing one section of a site (e.g., "`/account/*`
     needs auth") is useful context for a later audit of a different section of the same
     site.
   - `inventory.json` is the only mutable per-run state file. Its Zod schema includes the
     run phase and user choices as well as the page inventory, so discovery, resume, and
     report building validate the same contract. `hints.json` remains small,
     skill-managed JSON because no runtime command consumes it; documenting an explicit
     versioned shape is enough until a second code consumer exists.
   - Automated authentication reuses Playwright's storage-state format instead of defining
     an a11ied credential format. The skill runs the following command, asks the user to
     finish signing in, and waits for them to close the window:

      ```sh
      npx --no-install playwright codegen --save-storage=<path> <url>
      ```

      restricts the file to its owner where the platform supports that, and passes only its
      path through `--storage-state`. It never reads or prints the file. If the application
      keeps authentication only in session storage and the captured state does not work,
      the skill reports that limitation and offers an interactive, user-signed-in audit
      instead of requesting credentials.

   - Rendered HTML and accessibility-tree artifacts are opt-in because they can contain
     personal or confidential page content. When approved, discovery captures both from
     the same rendered Playwright page and records only relative artifact paths in the
     inventory. Reports never embed their raw contents.
   - `a1 report build`'s HTML/PDF output is a good default, not the only presentation.
     `report.json` is the complete render contract and `report.earl.json` is the EARL
     assertion contract; the skill may
     render its own HTML/PDF from them (e.g., with a company logo or brand colors) instead
     of the built-in renderer, using whatever tool access it has (writing HTML directly,
     printing it with a browser tool) rather than a CLI flag this plan would otherwise
     have to speculate about.
   - `.aix/skills/a11ied/` is a synced mirror maintained by external `aix` tooling
     (`.aix/extends/...`), not a second source of truth. This plan does not touch it.
   - The 404/500 sweep is scoped to one synthetic 404 probe plus auditing pages that
     already returned 5xx during discovery; the skill never deliberately tries to trigger
     a server error on a live target.
- Open questions: none remaining. The user resolved authentication, artifacts,
  resumability, sampling, and report-contract decisions. Their resolutions appear in the
  assumptions and FR-20 through FR-28.

## Requirements

### Functional

- FR-1: Before discovering anything, the skill must ask whether the audit covers a single
  page, a section of a site, or an entire site, and must not assume "entire site" by
  default.
- FR-2: For a whole-site or section audit, `a1 audit discover` must merge URLs from
  `sitemap.xml`, `Sitemap:` directives in `robots.txt`, sitemap indexes, and a rendered
  same-origin crawl. `--sitemap-only` is the explicit opt-out. A section audit defaults to
  the starting URL's path prefix; `--include` and `--exclude` can narrow that boundary.
- FR-3: `a1 audit discover` must resolve each discovered URL's redirect chain to a final
  URL, must read `<link rel="canonical">` when present, and must fold a URL into its
  canonical or final-redirect target as a duplicate rather than listing both as separate
  pages.
- FR-4: `a1 audit discover` must collect each page's final URL, status, rendered title,
  first rendered heading, canonical URL, login signals, and destructive-control signals
  from one Playwright visit. If the user approved page artifacts, it must also save the
  final rendered HTML and accessibility tree. Deciding template groups and writing
  `templateId`/`templates` remains the skill's job.
- FR-5: When the deduped page count is 50 or fewer, the skill may proceed to audit every
  page without asking.
- FR-6: When the deduped page count exceeds 50, the skill must report the exact count, its
  own assessment of the detected page templates, and must ask the user to choose between a
  complete audit of every page and a template-sampled audit, explaining in plain language
  what a template-sampled audit covers and skips, and giving a time estimate driven by the
  detected page and template counts.
- FR-7: When the user chooses a full audit and the discovered page count is large,
  `a1 audit discover` must still also attempt to find and include real error pages: a
  synthetic 404 probe against the target origin, plus any URL that already returned a 5xx
  status during discovery.
- FR-8: The coordinator must maintain one Zod-validated `inventory.json`, updated
  atomically after every discovered or audited page and every phase transition. Write a
  sibling temporary file, flush and close it, then rename it over the destination. A
  process interruption must leave either the previous valid inventory or the new one.
- FR-9: If the current agent runtime supports subagents, the skill must ask whether to
  parallelize the automated (axe-only) portion of the audit across pages, and must state
  plainly that screen-reader checks cannot be parallelized because only one screen reader
  session can be active at a time.
- FR-10: Before starting any real screen-reader session (VoiceOver or NVDA), the skill
  must warn the user that the screen reader will take over the machine's speech and
  keyboard focus, that the user must not try to exit the program while it runs, and that
  the machine must stay awake and unlocked for the duration.
- FR-11: The skill must not use the virtual screen reader (`--sr virtual`) for compliance
  judgments in this workflow. It must use a real screen reader (`--sr voiceover` or
  `--sr nvda`), whichever `a1 doctor` reports as available on the current machine.
- FR-12: The skill must detect likely login protection from a 401/403 response, a login
  redirect, or a rendered password form. Only then may it ask the user to choose a QA
  environment and complete login in a headed browser. It must never ask the user to paste
  a credential or secret. Automated discovery and audits reuse the resulting local
  Playwright storage-state file. Real screen-reader work pauses for user login inside the
  controlled browser and continues in that session.
- FR-13: The skill must detect, per page or per control, likely destructive actions
  (checkout, place order, delete, remove, cancel subscription, and similar) from link and
  button text, and must not click or submit them during discovery or auditing.
- FR-14: Before starting, the skill must confirm the `a1` CLI is available and that
  `a1 doctor` (or `a1 doctor --strict`) passes, and must check whether the `a1`/`allied`
  MCP server's tools are present in the current tool list; if not, it must fall back to
  the CLI directly rather than failing, and may note that building `packages/cli`
  (`npm run build --workspace packages/cli`) is what makes the MCP server launchable in
  this repo's own `.mcp.json`.
- FR-15: The skill must create one output folder per audit run for every artifact the
  audit produces (inventory, per-page results, optional page snapshots, screen-reader
  evidence, and the final report bundle).
- FR-16: The final report must be produced in three formats: a styled, self-contained HTML
  file; a PDF generated from that HTML; and a merged W3C EARL 1.0 JSON-LD report.
  `a1 report build` must also emit a complete JSON render model. This
  default render is a convenience, not the only allowed presentation (FR-17).
- FR-17: `report.json` must carry every fact the HTML/PDF render shows. EARL remains the
  standards-oriented assertion graph and need not duplicate presentation metadata. A
  custom renderer must need only `report.json`, with `report.earl.json` available when it
  specifically needs EARL assertions.
- FR-18: The HTML and PDF reports must state, for the audit as a whole and per page: what
  was tested and how (automated, hybrid, or manual, matching the existing test-method
  vocabulary), how many violations were found at each axe impact level (minor, moderate,
  serious, critical), which pages they were found on, and, per violation, the fix guidance
  axe/a11ied already carries plus the relevant WCAG criterion.
- FR-19: `a1 audit discover` and `a1 report build` must each get an MCP tool, and both
  must be added to (or explicitly, justifiably excluded from, matching the existing
  pattern in `packages/mcp-server/src/registry-parity.test.ts`) the CLI/MCP parity test.
- FR-20: `inventory.json` must record the run's phase (`discovering`,
  `template-review`, `auditing`, `report-building`, `complete`) and the choices made for
  that run (scope, the full-vs-sampled decision, whether `--probe-error-pages` was used,
  whether subagent parallelization and page-artifact capture were chosen) in its `run`
  object. The coordinator updates it at every phase transition and page completion, so a
  resumed run does not repeat a question.
- FR-21: Before starting a new audit, the skill must check the audits root
  (`.a11ied/audits/`) for an existing inventory whose `run.phase` is not `complete` for
  the same host, and if one exists, must ask the user whether to resume it or start a
  separate new run; it must never silently resume or silently discard one.
- FR-22: On resume, the skill must not repeat completed work: pages already `audited` in
  `inventory.json` must not be re-audited; a page left `in-progress` must resume from
  `a1 audit pending <url>`, which already reflects any evidence recorded before the
  interruption via the durable `.a11ied/evidence.jsonl` store, rather than restarting that
  page's checks from nothing; `a1 audit discover --resume-from <existing inventory>` must
  skip re-resolving a URL already present with a terminal status.
- FR-23: On resume, before any further screen-reader work, the skill must check for and
  clean up a screen-reader session left active by the interrupted run (`a1 sr status`,
  `a1 doctor`), consistent with the existing `a11ied` skill's session-cleanup rule.
- FR-24: The audit's output must include a lessons-learned file
  (`.a11ied/sites/<origin-key>/hints.json`) that the skill writes and updates, recording
  durable, reusable observations that could speed up a future audit of the same site:
  page-template groupings, which pages need auth, which controls are destructive,
  discovery quirks (e.g. a missing or incomplete sitemap), and axe findings worth a second
  look. Each entry must carry when it was recorded and which run recorded it.
- FR-25: At the start of a run, if a hints file already exists for the target host, the
  skill must read it and treat every entry as a hypothesis to re-verify against the
  current site, never a fact to apply without checking, since the site may have changed
  since the hint was recorded; an entry that no longer holds must be corrected or marked
  invalid in the file rather than left to mislead a later run.
- FR-26: Discovery must set `discovery.complete` to false and record a reason when a page,
  sitemap, time, or retry limit stops traversal. Reports must call the result a partial
  inventory and must not use "full site" for a truncated run.
- FR-27: In template-sampled mode, every untested page must remain `not-tested`. The report
  may say that a representative page supplied evidence about shared template behavior,
  but it must not claim the untested page itself passed. Sample selection must include the
  representative page plus observed structural or state variants.
- FR-28: The coordinator is the only process allowed to write `inventory.json`. Parallel
  workers may write only their assigned page result and artifact files, then return a
  completion message for the coordinator to merge.

### Non-functional

- NFR-1 (Performance): Discovery concurrency (link-following and status probing) must be
  capped and configurable (a sane default, override with a flag), so a large site does not
  open unbounded concurrent connections.
- NFR-2 (Security): Discovery must apply standards-compliant robots.txt user-agent,
  `Allow`, `Disallow`, wildcard, and end-anchor matching during crawl fallback and must
  send an identifiable User-Agent. Credentials must never appear in chat, command-line
  arguments, logs, inventory, hints, reports, or page filenames. Storage-state contents
  remain in one ignored local file and are deleted after the run unless the user asks to
  retain them. Every untrusted string interpolated into HTML must be escaped.
- NFR-3 (Privacy): Before saving rendered HTML or accessibility trees, the skill must
  explain that they may contain page content and ask once for consent. The choice is
  recorded in `inventory.json`. Authenticated artifacts require an explicit yes and are
  excluded from the report bundle by default.
- NFR-4 (Accessibility): The generated HTML report must itself pass an `a1 audit` with
  zero violations (semantic headings, sufficient color contrast, keyboard-operable any
  interactive elements such as collapsible sections, labeled landmark regions). This is a
  dogfooding acceptance criterion, not aspirational text.
- NFR-5 (Observability): `a1 audit discover` and `a1 report build` must support
  `--verbose` (the existing shared option) and must stream human-readable progress to
  stderr while writing their structured result to stdout or `--out`, matching every
  existing command's pattern.
- NFR-6 (i18n): Out of scope for this slice. Report chrome strings (headings, labels) stay
  English-only, consistent with the rest of the `a1` CLI's UI text. WCAG criterion text
  itself already comes from the localized `wcag-data`/`wcag-engine` packages and is passed
  through unchanged.
- NFR-7 (Reliability): A single page's discovery probe failure, audit failure, or
  screen-reader session failure must not abort the whole run; the skill records that
  page's inventory status as `error` with a reason and continues to the next page,
  and `a1 report build` must render a report even when some pages are marked `error`. A
  full run must be resumable after an interruption at any point (process killed, agent
  session ended, machine restarted) with no more than the current page's in-flight work
  lost, using `inventory.json` and the durable evidence store already
  on disk; resuming must never require the user to re-answer a question already answered
  in the original run.

## Architecture & design overview

```text
resume check: scan .a11ied/audits/*/inventory.json for this origin, run.phase != complete
   |                         |
   | none found              | found -> ask: resume, or start a separate new run?
   v                         v
(new run, new              (load inventory.json; if resuming into the
 timestamped dir)           auditing phase, `a1 sr status`/`a1 doctor` first to clean up
   |                         any screen-reader session the interrupted run left active)
   v                         |
a1 audit discover <url>      |            a1 audit <url> --format json --out ...
[--resume-from inv.json] <---+               ^  (looped once per page the skill
   |                                          |   chose to audit directly, by the
   v                                          |   skill or by parallel subagents for
sitemap.xml / robots.txt --------\            |   the axe-only portion; screen
(fetch + jsdom XML parse)         |            |   reader steps are always sequential)
   |                              v            |
   +--> same-origin crawl (Playwright,    inventory.json
   |     SPA-aware, robots.txt-aware)      <----(read/patch after every page and
   |                                        every phase transition)---+           |
   v                                                                   |          |
redirect + canonical resolution, dedup,                                |  a1 sr ... (per
synthetic 404 probe, title/heading capture,                            |   page, real
incremental inventory.json writes                                      |   screen reader)
   |                                                                    |          |
   v                                                                    |          |
agent reviews inventory.json (and any .a11ied/sites/<origin-key>/hints.json |       |
from a prior run, treated as hypotheses to re-verify), judges template  |          |
groups, patches templateId/templates back into inventory.json directly |          |
   +--------------------------------------------------------> a1 audit record <url> \
                                                                --criterion ... (folds SR
                                                                judgments into that page's
                                                                next `a1 audit --format
                                                                json` run)

a1 report build --inventory inventory.json --results-dir pages/
   |
   +--> aggregate.ts: reads inventory.json + every pages/<pageId>/audit.json,
   |     computes violation counts by page/criterion/impact, builds one merged EARL
   |     report by concatenating every page's assertions into @a11ied/earl's
   |     buildEarlReport (it already accepts a flat multi-subject assertion list)
   |
   +--> render-html.ts: one static, self-contained HTML file (summary dashboard +
   |     per-page detail + remediation guidance), styled inline, no external assets
   |
   +--> render-pdf.ts: launches the same Chromium-family browser
   |     (packages/core/src/browser/policy.ts) and calls page.pdf() against the
   |     rendered HTML, print CSS included in the HTML itself
   |
   +--> report.json: the only model render-html.ts consumes; report.earl.json: the
         standards assertion graph. Both remain available for alternate presentations
         when the built-in render is not the visual result the user wants

run finishes -> inventory.json run.phase set to complete; skill writes/updates
                .a11ied/sites/<origin-key>/hints.json with what it learned this run
```

Key decisions and why:

- Discovery and report-aggregation become real `a1` product commands, not skill-local
  scripts, because both are generically useful outside this one skill (any `a1` user doing
  a CI-based multi-page run wants them) and because keeping them in `packages/core` +
  `packages/cli` gets them typed, unit-tested, and MCP-covered for free, matching every
  other capability in this repo.
- `a1 audit discover` is a subcommand of `audit`, not a new top-level command and not a
  flag. It mirrors how `audit-evidence.ts` already nests `record`/`pending`/`clear` under
  `audit` for "actions related to auditing a target that are not themselves running the
  audit," and keeps `a1 audit <target>` (no subcommand) meaning exactly what it means
  today: run the full audit loop against one target.
- Per-page auditing reuses the existing engine. The only extension is shared
  `--storage-state <file>` page setup, passed into Playwright without reading or printing
  its contents. `a1 audit <target> --format json --out
<file>` and `a1 audit record <target> --criterion ... --outcome ...` already exist and
  already fold recorded screen-reader evidence into that page's JSON/EARL output via
  `buildAuditEarlReport` (`packages/core/src/audit/earl.ts`). This is also what makes
  per-page resumability nearly free: recorded evidence lives in `.a11ied/evidence.jsonl`,
  a durable store keyed by subject, not in any per-run state, so a screen-reader judgment
  made before a crash is never lost even if the page's final JSON report never got
  written. The skill's job is purely to call these in the right order per page, not to
  reimplement anything they already do.
- `a1 axe [targets...]` already supports many targets in one call
  (`packages/cli/src/commands/axe-multi.ts`); this plan does not change that command. It
  intentionally keeps `a1 audit` single-target (its existing, tested contract) and pushes
  multi-page composition to the new `a1 report build` step instead of teaching `audit`
  itself to take many targets.
- The merged EARL report needs no new EARL-building logic: `buildEarlReport` in
  `packages/earl/src/report.ts` already accepts a flat `assertions: EarlAssertionInput[]`
  across arbitrary subjects. Report aggregation only needs to collect every page's
  assertions (via the same `listAxeEarlAssertions` + recorded-evidence mapping already used
  in `packages/core/src/audit/earl.ts`) and pass the concatenation through once.
- Template grouping is deliberately not an algorithm. A DOM-structural fingerprint is
  brittle against real-world template variation (optional sidebars, A/B tests, seasonal
  banners) in ways that would either over-split or over-merge pages an agent could tell
  apart correctly by reading titles, URLs, and a quick look at a few rendered pages.
  `a1 audit discover` supplies the raw signal; the skill supplies the judgment and writes
  it back into the same inventory file every other step already reads.
- Report branding is deliberately not a CLI flag surface. `report.json` carries everything
  the HTML/PDF render shows, so a company logo or a different
  layout is something the skill can build directly from that data with whatever tool
  access it has, instead of this plan guessing at a `--logo`/`--brand-color`/`--template`
  flag set ahead of any real customization request.
- Crawl-fallback resumability is intentionally coarse. Persisting an in-progress crawl's
  frontier (visited set, pending queue, per-URL retry state) is real complexity for a
  phase that is comparatively cheap to simply re-run; instead, `discoverSite` accepts an
  existing inventory as `resumeFrom` and skips re-resolving any URL already present with a
  terminal status, so re-running after a crash costs re-crawling for new links, not
  re-resolving already-known pages. The expensive phase - the per-page audit loop, with
  real screen-reader sessions - gets the strong, near-free resumability described above,
  because that is where losing work actually hurts.
- Run state lives inside the Zod-validated inventory instead of a second checkpoint file.
  Hints stay skill-managed because no runtime code consumes them. Add a runtime schema for
  hints only when another code path needs to read them.

## Task grid

This grid is the design map, not the live task tracker. Before implementation, create the
corresponding Beads issues with `bd create`, add their dependencies with `bd dep add`, and
claim each issue before changing code. Track execution state in Beads rather than editing
the status cells below.

| Status | ID   | Task                                                        | Priority | Depends on             | Acceptance criteria                                                                                                                                                                                                        |
| ------ | ---- | ----------------------------------------------------------- | -------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]    | T-01 | Add discovery and report contracts                          | H        | -                      | Zod schemas define complete versioned `SiteInventory` and `ReportModel` contracts; no unused bookkeeping schemas                                                                                                           |
| [ ]    | T-02 | Sitemap discovery module                                    | H        | T-01                   | Given a `sitemap.xml`/index/`robots.txt`, returns every listed URL; unit-tested against fixture XML                                                                                                                        |
| [ ]    | T-03 | Rendered crawl, authentication, page signals, and artifacts | H        | T-01                   | One Playwright visit resolves each page, supports storage state, captures SPA signals, and optionally saves HTML/tree artifacts                                                                                            |
| [ ]    | T-04 | Discovery orchestration, incremental writes & resume-from   | H        | T-02, T-03             | One function turns a start URL into a `SiteInventory`, deduped, with a synthetic 404 probe entry and per-page title/heading signal; writes incrementally as pages resolve; given `resumeFrom`, skips already-resolved URLs |
| [ ]    | T-05 | `a1 audit discover` CLI subcommand                          | H        | T-04                   | `a1 audit discover <url> --format json --out inventory.json` produces a valid `SiteInventory`; `--resume-from <file>` continues an interrupted discovery; text output summarizes counts                                    |
| [ ]    | T-06 | `audit_discover` MCP tool + parity                          | M        | T-05                   | New MCP tool callable with the same inputs; `registry-parity.test.ts` passes                                                                                                                                               |
| [ ]    | T-07 | Report aggregation engine                                   | H        | T-01                   | Given an inventory + N `audit.json` files, computes violation counts by page/criterion/impact and a merged EARL report                                                                                                     |
| [ ]    | T-08 | HTML report renderer                                        | H        | T-07                   | Renders a self-contained, styled HTML file from the aggregate; the file itself passes `a1 audit` with zero violations                                                                                                      |
| [ ]    | T-09 | PDF report renderer                                         | M        | T-08                   | `page.pdf()` against the rendered HTML produces a readable, paginated PDF using the existing browser launch policy                                                                                                         |
| [ ]    | T-10 | `a1 report build` CLI command                               | H        | T-07, T-08, T-09       | `a1 report build --inventory ... --results-dir ... --out ...` writes `report.html`, `report.pdf`, `report.earl.json`, `report.json`                                                                                        |
| [ ]    | T-11 | `report_build` MCP tool + parity                            | M        | T-10                   | New MCP tool callable with the same inputs; parity test passes                                                                                                                                                             |
| [ ]    | T-12 | Write the skill's `SKILL.md`                                | H        | T-05, T-10             | Full orchestration workflow per FR-1 through FR-28, under ~500 lines                                                                                                                                                       |
| [ ]    | T-13 | Skill resources (run state and decision reference)          | M        | T-12                   | One `resources/run-state-and-decisions.md` covers inventory, resume, hints, authentication, privacy, and branching without duplicating the skill                                                                           |
| [ ]    | T-14 | Register the skill (`ai.json`, `agents/openai.yaml`)        | M        | T-12, T-13             | Skill discoverable the same way `packages/skills/a11ied` is                                                                                                                                                                |
| [ ]    | T-15 | Cross-link from the existing `a11ied` skill                 | L        | T-12                   | One short section in `packages/skills/a11ied/SKILL.md` pointing to the new skill for whole-site scope                                                                                                                      |
| [ ]    | T-16 | Docs site pages                                             | M        | T-05, T-10, T-12       | New reference pages for both commands and the skill, in the docs site's existing command-reference pattern                                                                                                                 |
| [ ]    | T-17 | Release readiness doc update                                | L        | T-12, T-14             | `internal-docs/releases/v0.1.0-readiness.md` agent-skill section lists the new bundle                                                                                                                                      |
| [ ]    | T-18 | Discovery unit tests                                        | H        | T-02, T-03, T-04       | Sitemap parsing, redirect/canonical resolution, dedup, signal capture, 404 probing, incremental writes, and `resumeFrom` skip-behavior each covered                                                                        |
| [ ]    | T-19 | Report aggregation/render tests                             | H        | T-07, T-08, T-09       | Violation-count math, EARL merge correctness, and an HTML/PDF render smoke test                                                                                                                                            |
| [ ]    | T-20 | CLI + MCP handler tests                                     | H        | T-05, T-06, T-10, T-11 | `handlers-audit-discover.test.ts` (including `--resume-from`), `handlers-report.test.ts`, MCP harness coverage                                                                                                             |
| [ ]    | T-21 | Manual verification                                         | H        | T-12, T-18, T-19, T-20 | `npm run standards` and `npm test` pass; a real run against a small fixture site, including a simulated crash-and-resume, produces a report a person would call presentable                                                |

## Task details

### T-01 - Add discovery and report contracts

**Goal:** Give runtime-consumed JSON complete Zod schemas, matching the existing
`packages/contracts/src/schemas/*.ts` split-by-domain pattern.

**Step-by-step instructions:**

1. Create `packages/contracts/src/schemas/discovery.ts`. Define, with `zod`:
   - `pageDiscoveryMethodSchema`: enum `sitemap`, `crawl`, `manual`, `error-probe`.
   - Separate `pageDiscoveryStatusSchema` and `pageAuditStatusSchema`; do not reuse audit
     status to decide whether URL resolution finished. Include `not-tested` in audit status.
   - `pageRecordSchema`: object with `pageId` (string, filesystem-safe slug), `url`
     (string), `finalUrl` (string), `canonicalUrl` (optional string), `status` (number, or
     the literal `"error"`), `discoveredVia` (`pageDiscoveryMethodSchema`), `title`
     (optional string), `headingSample` (optional string, the first heading's text),
     `templateId` (optional string, unset until the skill assigns it), `isDuplicateOf`
     (optional string, a `pageId`), `requiresAuth` (boolean), `hasDestructiveActions`
     (boolean), `discoveryStatus`, `auditStatus`, optional structured error, optional
     relative `htmlArtifactPath`/`accessibilityTreeArtifactPath`, `auditedAt` (optional ISO
     datetime string), `violationCounts` (optional object with `minor`, `moderate`,
     `serious`, `critical`, all numbers, matching the impact vocabulary already used by
     `--fail-on` in `packages/cli/src/commands/audit.ts`).
   - `siteInventorySchema`: versioned object with `startUrl`, `generatedAt`, `run`
     (`runId`, sanitized `originKey`, phase, timestamps, scope, section path, and recorded
     choices), `discovery` (complete/truncated, reasons, limits, sources and failures),
     `pages` (array of `pageRecordSchema`),
     `templates` (array of `{ templateId, representativePageId, memberPageIds }`, empty
     until the skill populates it).
   - Export inferred TypeScript types (`PageRecord`, `SiteInventory`, etc.) alongside each
     schema, following the existing convention in `schemas/earl.ts`/`schemas/evidence.ts`.
2. Create `packages/contracts/src/schemas/report.ts`. Define one versioned `reportModelSchema`
   containing all data used by HTML: inventory summary, methodology, discovery gaps,
   page-criterion outcomes (`passed`, `failed`, `cantTell`, `notTested`, `inapplicable`),
   findings, selectors, guidance, template sampling judgments, page errors, warnings, and
   totals. Do not define a smaller summary that forces the renderer to read other inputs.
3. Add both new files to the barrel exports in `packages/contracts/src/index.ts`, in
   the same `export * from './schemas/...'` list, ordered after `evidence.js` as the
   newest entries.
4. Add a `.test.ts` beside each new schema file validating complete, partial, sampled,
   authenticated, and invalid examples
   parse, matching the style already used for `schemas/earl.ts`'s tests.
5. Run `npm run typecheck --workspace @a11ied/contracts` and
   `npm test --workspace @a11ied/contracts`.

### T-02 - Sitemap discovery module

**Goal:** Turn a start URL into every URL its sitemap(s) list, with no crawling.

**Step-by-step instructions:**

1. Create `packages/core/src/discovery/sitemap.ts`.
2. Implement `fetchRobotsSitemaps(originUrl: string, request: APIRequestContext):
Promise<string[]>` so authenticated and unauthenticated discovery use the same
   timeout-bounded Playwright request context. Return an empty array on a non-200 response.
3. Implement `parseSitemap(xml: string, sourceUrl: string): { urls: string[];
childSitemaps: string[] }` using `jsdom`'s `DOMParser` in `text/xml` mode:
   `new JSDOM(xml, { contentType: 'text/xml' })`. Read every `<url><loc>` text for a URL
   set, and every `<sitemap><loc>` text for a sitemap index's child sitemaps.
4. Implement `discoverSitemapUrls(startUrl: string, options: { maxSitemaps?: number })`:
   try `<origin>/sitemap.xml` first, then `robots.txt` directives; recurse into child
   sitemaps up to `maxSitemaps` (default 50) to bound pathological sitemap indexes; dedupe
   the result with a `Set`; return URLs, sitemaps used, failures, and whether the limit
   truncated traversal.
5. Every fetch in this module must set a `User-Agent` header identifying the tool (e.g.
   `a11ied-audit-discover/<version>`), per NFR-2.

### T-03 - Rendered crawl, authentication, page signals, and artifacts

**Goal:** Cover sitemap-less sites and SPA routes, normalize every discovered URL to its
real, canonical destination, and capture the title/heading signal the skill will later use
to judge template groupings (FR-4) without a second fetch pass.

**Step-by-step instructions:**

1. Before writing a robots parser, search npm for a maintained permissively licensed
   parser compatible with the repository's license policy. Use it if one fits. Otherwise,
   implement and test user-agent group precedence, `Allow`, `Disallow`, `*`, `$`, empty
   rules, and URL-path normalization; a prefix-only parser does not satisfy NFR-2.
2. Create `packages/core/src/discovery/crawl.ts`. Implement a rendered page visitor that:
   - Uses the existing browser launch helpers in `packages/core/src/browser/` (reuse
     `shared-browser.ts`/`policy.ts`; do not open a second, parallel browser-launch code
     path).
   - Creates browser contexts with `storageState: options.storageStatePath` when supplied.
     Pass only the path; never read, copy, serialize, or log the storage-state contents.
   - Loads each queued page once; reads its response status, final URL, rendered canonical,
     title, first heading, password-form signals, destructive controls, rendered HTML, and
     same-origin links from that page. Resolve relative canonicals against the final URL.
   - Normalizes URL fragments, default ports, host casing, and empty paths before deduping.
     Do not send authenticated state to a different origin after a redirect.
   - Runs at most `concurrency` pages at a time (default 5) and stops at `maxPages`
     (default 2000), both overridable.
3. If `artifactsDir` is set, save `snapshot.html` and `accessibility-tree.json` under the
   page's directory. Export a small page-level accessibility-tree reader from the existing
   tree runtime so discovery reuses its `ariaSnapshot()` parsing instead of inventing a
   second tree format. Never embed or open the raw HTML as trusted report content.
4. Add `packages/core/src/discovery/crawl.test.ts`, `robots.test.ts`, and
   rendered-visit tests against fixture HTML/servers (use the same fixture-server pattern
   already used elsewhere in `packages/core`'s tests; grep for an existing local test
   HTTP server helper before writing a new one).

### T-04 - Discovery orchestration, incremental writes & resume-from

**Goal:** One entry point that produces the `SiteInventory` the CLI command and the skill
both consume, with template grouping intentionally left blank for the skill to fill in,
and with the on-disk inventory kept current enough that a crash never loses more than the
page in flight.

**Step-by-step instructions:**

1. Create `packages/core/src/discovery/runtime.ts`. Implement `discoverSite(startUrl:
string, options: DiscoverOptions): Promise<SiteInventory>` where `DiscoverOptions`
   includes an optional `resumeFrom?: SiteInventory` and an optional `onProgress?:
(partial: SiteInventory) => Promise<void> | void`. The function:
   - Calls `discoverSitemapUrls` and `crawlSameOrigin` by default, then merges their URL
     sets. Skip crawling only for explicit `sitemapOnly`. Apply the section path and
     include/exclude filters before queuing a URL.
   - When `resumeFrom` is given, skips the rendered visit for any URL already present
     in `resumeFrom.pages` with a terminal `discoveryStatus` (i.e., already resolved
     to a final URL/status last run), and seeds the working page list from those existing
     records instead. Only newly-discovered URLs get resolved this run.
   - Resolves every remaining URL with T-03's rendered visitor, respecting concurrency,
     and awaits `onProgress` after every page. The CLI callback completes an atomic write
     before another finished page is merged.
   - Folds a URL into an existing page's record as a duplicate when its `finalUrl` or
     `canonicalUrl` matches another page already resolved (FR-3); mark the folded record's
     `auditStatus` as `skipped-duplicate` and set `isDuplicateOf`.
   - Carries each surviving page's rendered signals straight from T-03
     into its `pageRecordSchema` entry (FR-4). Leaves `templateId` unset and `templates`
     empty; this function does not group pages.
   - Applies the login-protection heuristic (FR-12) and destructive-action heuristic
     (FR-13) per page, setting `requiresAuth`/`hasDestructiveActions`.
   - When `options.probeErrorPages` is true (full-audit mode, FR-7): requests
     `<origin>/a11ied-404-probe-<random>` and adds it as a page with `discoveredVia:
'error-probe'` if it returns a non-200 status (or a 200 whose title/heading contains
     "not found"/"404"); also promotes any page that already resolved to a 5xx status into
     scope rather than dropping it.
   - Assigns each page a cross-platform id made from a short `[a-z0-9-]` label plus an
     8-character SHA-256 suffix of its normalized URL. Build `originKey` the same way; do
     not place raw hosts or ports in paths. A `pageId` a `resumeFrom` record
     already had must be preserved unchanged, so `pages/<pageId>/audit.json` paths from
     the interrupted run stay valid.
   - Every fetched/rendered response's raw body must never be written to the inventory;
     only the derived fields above are persisted (keeps the inventory small and avoids
     ever persisting response bodies from an authenticated crawl).
2. Implement `writeInventoryAtomic(inventory: SiteInventory, path: string): Promise<void>` and
   `readInventory(path: string): Promise<SiteInventory>` (parse through
   `siteInventorySchema` on read. Validate before writing, use a sibling temporary file,
   flush and close it, then rename it over the destination. The
   skill uses `readInventory`/`writeInventory` itself, via the CLI's JSON output and a
   direct file edit, to patch in `templateId`/`templates` after its own review (no new
   command needed for that step).
3. Add `packages/core/src/discovery/runtime.test.ts` covering the merge/dedupe/signal-
   capture/error-probe/incremental-write/`resumeFrom`-skip behavior end to end against a
   small fixture site, and asserting that `templateId`/`templates` come back empty.

### T-05 - `a1 audit discover` CLI subcommand

**Goal:** Expose discovery as a subcommand of `audit`, matching every other command's
option-composition and output-format conventions, the existing `audit record`/
`audit pending` nesting pattern, and making resumability a first-class flag rather than an
implicit behavior.

**Step-by-step instructions:**

1. Add one shared `addStorageStateOption` helper and use it in `a1 audit`, `a1 audit
pending`, and discovery. Extend the existing MCP `audit` and pending-results tools with
   the same local path input. Pass the path into Playwright context creation and
   authenticated request contexts. Do not add raw cookie or header options to this
   workflow.
2. Create `packages/cli/src/commands/audit-discover-actions.ts`: `handleAuditDiscoverAction(
url: string, options: AuditDiscoverActionOptions): Promise<{ result: SiteInventory;
exitCode: number }>`, calling `discoverSite` from `@a11ied/core` (re-export it from
   `packages/core/src/index.ts` the same way other engine entry points are re-exported).
   When `options.resumeFrom` is set, read that file with `readInventory` first and pass it
   through as `discoverSite`'s `resumeFrom`. Wire `discoverSite`'s `onProgress` callback to
   call `writeInventoryAtomic` against `options.out` (when `--out` is set) so the file on disk
   stays current through the run, not only at the end. Exit code is `cliExitCodes.success`
   unless discovery found zero pages, in which case use the existing "nothing found" exit
   code convention (match whatever `search`/`wcag` use for an empty result; do not invent a
   new exit code).
3. Create `packages/cli/src/commands/audit-discover.ts`: export
   `registerAuditDiscoverCommand(auditCommand: Command): void` that registers `discover
[url]` on the passed-in `audit` command, following the exact structure of
   `registerAuditEvidenceCommands` in `audit-evidence.ts`. Compose `addJsonOption`,
   `addVerboseOption`, `addStorageStateOption` (from step 1), plus command-specific
   options: `--scope <page|section|site>`, `--sitemap <url>`, `--sitemap-only`,
   `--max-pages <n>`, `--max-sitemaps <n>`, `--concurrency <n>`, `--timeout <duration>`,
   `--include <glob...>`, `--exclude <glob...>`, `--probe-error-pages` (FR-7, off by
   default; the skill passes it only for a chosen full audit), `--resume-from <file>` (an
   existing inventory JSON file to continue from, per FR-22), `--artifacts-dir <dir>`,
   `--out <file>` (write the
   inventory JSON there, and update it incrementally when set; default stdout, no
   incremental writes possible without a file target).
4. In `packages/cli/src/commands/audit.ts`, import `registerAuditDiscoverCommand` and call
   it right alongside the existing `registerAuditEvidenceCommands(auditCommand);` line
   inside `registerAuditCommand`, so `a1 audit discover` registers the same way
   `a1 audit record`/`a1 audit pending` already do.
5. Add a text renderer in `packages/cli/src/renderers/` (`audit-discover.ts`): a
   human-readable summary (page count, duplicates folded, pages needing auth, pages with
   likely destructive actions, and, when `--resume-from` was used, how many pages were
   carried over unresolved vs. newly resolved this run), matching the terse style of
   `renderAuditText`.
6. Add `packages/cli/src/testing/handlers-audit-discover.test.ts` following the existing
   `handlers-audit-evidence.test.ts` pattern, including a case that runs discovery once,
   interrupts it conceptually by taking its partial output as a fixture, then reruns with
   `--resume-from` and asserts already-resolved pages were not re-fetched.

### T-06 - `audit_discover` MCP tool + parity

**Goal:** MCP parity with the CLI subcommand, matching every existing command.

**Step-by-step instructions:**

1. Create `packages/mcp-server/src/tools/audit-discover.ts` exposing an `audit_discover`
   tool with the same inputs as the CLI subcommand, including output and storage-state
   paths. Call `discoverSite` directly; the MCP package depends on core, not CLI. Keep
   CLI formatting and exit-code behavior out of the MCP package, per
   `packages/mcp-server/src/lib/shared.ts`'s existing pattern for wrapping a core function
   as a tool. Confirm this naming against how `packages/mcp-server/src/tools/evidence.ts`
   already names the tools for `audit record`/`audit pending`, and match that convention
   exactly rather than introducing a second naming scheme for audit subcommands.
2. Register the tool in `packages/mcp-server/src/server.ts` alongside the other `tools/
*.ts` registrations.
3. Add `'audit discover': ['audit_discover']` to `TOOL_BY_COMMAND` in
   `packages/mcp-server/src/registry-parity.test.ts`.
4. Run `npm test --workspace @a11ied/mcp-server` and confirm the parity test passes.

### T-07 - Report aggregation engine

**Goal:** Merge many pages' `AuditReport` JSON into one summary and one EARL report,
reusing the existing per-page EARL-building code rather than re-deriving it.

**Step-by-step instructions:**

1. Create `packages/core/src/report/aggregate.ts`.
2. Implement `loadPageAuditReports`: parse each file as the CLI output envelope that
   `a1 audit --format json --out` actually writes, then validate and extract `result`.
   Record a structured page error for a missing or corrupt file instead of silently
   dropping it. Add a runtime schema for the persisted audit result if none exists.
3. Implement `buildReportModel(inventory, pageReports): ReportModel`. Compute one outcome
   per page and criterion: `failed` wins over `passed`; a pending or uncovered criterion
   is `cantTell` or `notTested`, never passed; an explicit recorded result supplies the
   manual outcome. Count page-criterion outcomes, not unique criterion ids. Preserve each
   criterion's own test method; do not invent a page-level "dominant" method.
4. Implement `buildAggregateEarlReport(pageReports: { pageId: string; report: AuditReport
}[], options: AuditEarlReportOptions): EarlReport`: for each page, reuse
   `listAxeEarlAssertions(report.axe, profile)` and the `recorded.map(toAssertion)` logic
   already private to `packages/core/src/audit/earl.ts`. Export those two currently-
   private helpers (or a small `buildPageEarlAssertions(report, wcagVersion)` wrapper
   around them) from that file so this new module can reuse them instead of duplicating
   the mapping logic - do not copy/paste the assertion-building code. Concatenate every
   page's assertions and pass the full list through one `buildEarlReport` call
   (`packages/earl/src/report.ts`), so the multi-page EARL report is one valid JSON-LD
   graph, not one file per page.
5. Add `packages/core/src/report/aggregate.test.ts`: fixture inventory + two CLI-envelope
   audit files, assert all outcome buckets, errors, sampling labels, and merged EARL.

### T-08 - HTML report renderer

**Goal:** A single, self-contained, good-looking HTML file that is a solid default, not
the only allowed presentation (FR-17) - built with the same restraint
`internal-docs/research/impeccable-skills-analysis.md` already argued for on the docs
site: an actual point of view, obvious hierarchy, no generic AI-web defaults.

**Step-by-step instructions:**

1. Create `packages/core/src/report/render-html.ts`. Implement `renderHtmlReport(model:
ReportModel): string` returning one complete HTML document as a string: inline
   `<style>`, no external network requests, no external fonts (system font stack), so the
   file works standalone and offline and is safe to hand to `page.pdf()` in T-09.
2. Structure, top to bottom:
   - A summary header: audit title, start URL, date, scope (page/section/site), total
     pages audited vs. discovered, and total violations by impact as a compact, labeled
     count (not a decorative chart with no axis labels).
   - A methodology section stating plainly what was automated, what was hybrid, and what
     was manual, and that a passing automated result is not a full compliance claim, per
     the existing skill's own "Rules" section - the report must not overclaim any more
     than the CLI already refuses to.
   - A per-template summary naming pages audited directly and pages not tested. It may
     explain which shared-template observations came from a representative page, but must
     never say the untested members passed or were covered.
   - A per-page section, grouped by violation severity within the page, each violation
     showing: the axe rule id, the WCAG criterion(s) returned by the existing axe-rule
     mapping helper, the element selector, and axe's own fix text
     (`report.axe`'s existing violation nodes already carry this - do not re-derive fix
     text).
   - An appendix: the full page inventory table (url, status, template, audit status),
     for traceability back to `inventory.json`.
3. Escape every model value before interpolation. Use semantic HTML (`<h1>`-`<h3>` in correct nesting order, `<main>`, `<section>`,
   `<table>` with `<th scope>`, no `<div>` soup) and sufficient color contrast in the
   inline stylesheet, because NFR-4 requires the report itself to pass `a1 audit`.
4. Any collapsible section (e.g., "show all passed checks") must be a native
   `<details>/<summary>` element, not custom JS, so it stays keyboard-operable and works
   identically in the PDF's fully-expanded print view (see T-09 step 2).
5. Add `packages/core/src/report/render-html.test.ts`: render a small fixture summary,
   assert key figures appear in the output, and assert the output is well-formed HTML
   (parse it back with `jsdom` and check for zero parse errors).

### T-09 - PDF report renderer

**Goal:** A print-ready PDF from the same HTML, no new dependency.

**Step-by-step instructions:**

1. Create `packages/core/src/report/render-pdf.ts`. Implement `renderPdfReport(html:
string, outPath: string): Promise<void>`:
   - Launch a Chromium-family browser using the existing policy in
     `packages/core/src/browser/policy.ts`/`shared-browser.ts` (do not add a second
     browser-launch code path).
   - Open a new page, `page.setContent(html, { waitUntil: 'networkidle' })` (no
     external assets to wait on since T-08's output is self-contained).
   - Before printing, set `open` on every `<details>` element in the loaded page. CSS alone
     does not reliably override the browser's closed-details rendering behavior.
   - Call `page.pdf({ path: outPath, format: 'A4', printBackground: true, margin: {...} })`.
   - Close the page/browser context, reusing whatever cleanup helper
     `packages/core/src/browser/shared-browser.ts` already exposes for other commands.
2. Add `packages/core/src/report/render-pdf.test.ts`: render a small fixture HTML string
   to a temp file and assert the output file exists and starts with the `%PDF-` magic
   bytes. Do not assert on rendered pixel content (out of scope, brittle).

### T-10 - `a1 report build` CLI command

**Goal:** Expose report aggregation and rendering as one command that always emits the
underlying data alongside the default render (FR-17).

**Step-by-step instructions:**

1. Create `packages/cli/src/commands/report-actions.ts`: `handleReportBuildAction(options:
ReportBuildActionOptions): Promise<{ result: ReportModel; exitCode: number }>` that
   reads the inventory (`readInventory`, T-04), loads every page's persisted audit result
   (`loadPageAuditReports`, T-07), builds the complete model, and writes `report.html`,
   `report.pdf`, `report.earl.json`, and `report.json` into `--out`. Exit code follows the
   same convention as `audit`: non-zero if any audited page has a violation at or above
   `--fail-on` (reuse that option's semantics, do not invent a second severity flag).
2. Create `packages/cli/src/commands/report.ts`: register a `report` command family with a
   `build` subcommand (mirroring how `audit-evidence.ts` nests `record`/`pending`/`clear`
   under `audit`): `a1 report build --inventory <file> --results-dir <dir> --out <dir>
[--title <string>] [--formats <list>] [--fail-on <impact>] [--wcag <version>]`.
   `--formats` defaults to `html,pdf,earl,json`; accept a subset (e.g. `html,json` for a
   fast CI check without the PDF's browser-launch cost) but never allow omitting `json` -
   it must always be produced alongside whatever else is requested, since it is the data
   contract FR-17 depends on. Do not add branding/template flags; that customization path
   is the skill building its own render from `report.json`, not a CLI option (see
   Assumptions).
3. Register in `packages/cli/src/program.ts`, placed after `registerAuditCommand`.
4. Add a text renderer summarizing the totals and the output file paths written.
5. Add `packages/cli/src/testing/handlers-report.test.ts`.

### T-11 - `report_build` MCP tool + parity

**Step-by-step instructions:**

1. Create `packages/mcp-server/src/tools/report-build.ts` with the same inputs as the CLI
   subcommand. Call the core report builder directly; do not import a CLI action handler.
   Mark its annotations as filesystem-mutating because it writes the output directory.
2. Register in `packages/mcp-server/src/server.ts`.
3. Add `'report build': ['report_build']` to `TOOL_BY_COMMAND` in
   `registry-parity.test.ts`.
4. Run the MCP package's tests; confirm parity passes.

### T-12 - Write the skill's `SKILL.md`

**Goal:** The orchestration brain: the part of this plan that is genuinely a conversation
and a judgment-driven workflow, not a deterministic function, and so belongs in agent
instructions rather than code.

**Step-by-step instructions:**

1. Create `packages/skills/full-site-audit/SKILL.md`. The `name:` frontmatter field must
   be `full-site-audit`, matching the directory name per the Agent Skill spec.
2. Frontmatter: `name: full-site-audit`, and a `description` under 1024 characters
   covering both what the skill does and when to use it (evidence audit, whole site,
   WCAG AA, screen reader, resumable), following the existing skill's description as a
   length/style model.
3. Body sections, each directly answering one or more FRs above:
   - **Resuming an interrupted audit**: before asking about scope, list
     `.a11ied/audits/*/inventory.json`, filter to the target origin with `run.phase` not
     `complete`, and if one is found, ask the user whether to resume it or start a
     separate new run (FR-21); never resume or discard one without asking. If resuming,
     load and validate `inventory.json` from that run's directory, and, before
     doing anything else, run `a1 sr status` and `a1 doctor` to detect and clean up a
     screen-reader session the interrupted run may have left active (FR-23), then
     continue from `run.phase` rather than starting over.
   - **Scope**: ask page vs. section vs. site (FR-1). Do not default to "entire site."
     Skip this when resuming; the scope is already in `inventory.json`.
   - **Preflight**: `a1 doctor --strict`; check whether `a1`/`allied` MCP tools are in the
     current tool list, note the CLI-fallback behavior and the `packages/cli` build
     requirement if not (FR-14).
   - **Lessons learned from a previous audit**: if `.a11ied/sites/<origin-key>/hints.json`
     exists, read it before discovery and hold its entries as hypotheses, not facts -
     the site may have changed since they were recorded (FR-25). Use them to guide where
     to look first (a known template grouping, a known auth-gated section, a known
     false-positive axe rule to double-check rather than skip), and correct or invalidate
     any entry this run finds no longer holds.
   - **Authentication and artifact consent**: if discovery finds login protection, ask the
     user to sign in with the Playwright codegen command in the authentication resource and
     close the window. Pass only that path through `--storage-state`.
     Separately ask whether to save rendered HTML and accessibility trees, explaining that
     they may contain private page content. Never ask for or inspect a secret.
   - **Discovery**: run `a1 audit discover <url>`, setting `run.phase` to `discovering` in
     `inventory.json` (FR-2, FR-3, FR-20); for 50 or fewer pages, proceed
     (FR-5); for more, present the count and the skill's own read on the detected
     templates and the full-vs-sampled choice with a time estimate (FR-6), and only then,
     if the user chose full, rerun discovery with `--probe-error-pages` (FR-7). Record the
     choices made into `inventory.json`'s `run.optionsChosen` (FR-20).
   - **Template review (agent judgment, not automated)**: set `run.phase` to
     `template-review`; review URL/title/heading signals and any approved rendered HTML or
     accessibility-tree artifacts. Inspect representative and variant pages directly;
     never infer a template from URL shape alone. Write the grouping back into
     `inventory.json`'s `pages[].templateId` and `templates` array directly, since it is a
     plain JSON file (FR-4). State this judgment to the user in the FR-6 explanation
     rather than presenting it as a measured fact.
   - **The running inventory**: state its exact path (`<out-dir>/inventory.json`) and that
     only the coordinator atomically rewrites it after every page and phase change. This is
     the "standard format" progress record the brief asked for, and what makes the audit
     resumable.
   - **Parallelization**: if the runtime supports subagents, ask whether to parallelize
     the axe-only per-page audits (each a plain `a1 audit <url> --format json --out
<path>` call with no screen reader involvement); state plainly that screen-reader
     steps always run sequentially, one session at a time (FR-9). Workers write only their
     own page files; the coordinator merges completion into inventory state.
   - **Screen reader safety**: the VoiceOver/NVDA takeover warning, verbatim in spirit
     with FR-10, before the first real session starts, not buried mid-workflow.
   - **Real screen reader only**: explicit override of the general `a11ied` skill's
     `--sr virtual` default for this workflow, with the reason (FR-11; cross-reference
     `packages/skills/a11ied/SKILL.md`'s "Real screen reader vs. virtual" section rather
     than restating its content).
   - **Per-page loop**: set `inventory.json`'s `run.phase` to `auditing` once; then,
     per page: `a1 audit pending <url>` to see remaining hybrid/manual criteria (on a
     resumed page this already reflects evidence recorded before the interruption, per
     FR-22), `a1 sr ...` to gather the rest, `a1 audit record <url> --criterion ...
--outcome ...` per judged criterion, then `a1 audit <url> --format json --out <path>`
     to produce that page's final CLI-envelope report file and mark it `audited` in
     `inventory.json`
     (this exact sequence is what makes screen-reader evidence show up in the final EARL
     report with no extra glue code, and what makes a page resumable from wherever it
     stopped).
   - **Login and destructive actions**: for automated work, pass the storage-state path to
     every discovery, pending, and audit call. For real screen-reader work, start on the
     login page, pause while the user signs in inside that browser, and keep the session
     open across pages. Never click or submit a flagged destructive control.
   - **Final report**: set `run.phase` to `report-building`, run `a1 report build ...`
     (FR-16), then set it to `complete`; tell the user where
     the four report files landed.
   - **Customizing the report**: `report.html`/`report.pdf` are a solid default, not a
     constraint. If the user wants something the default render does not offer - a
     company logo, brand colors, a different layout - build it from `report.json`
     (the complete render model) and/or `report.earl.json` (per-criterion assertions)
     directly, rather than trying to configure the built-in renderer or telling the user
     it cannot be done (FR-17). Say plainly that this is expected, agent-driven work, not
     a fallback.
   - **Lessons for next time**: as the last step, write or update
     `.a11ied/sites/<origin-key>/hints.json` with what this run learned - template groupings,
     pages needing auth, destructive controls, discovery quirks (missing/incomplete
     sitemap, a redirect surprise), and any axe finding worth flagging for a second look
     next time - each entry timestamped and tagged with this run's id (FR-24). Tell the
     user this file exists and that it will speed up, but never silently drive, the next
     audit of this site.
   - **Rules**: a short bullet list mirroring the existing skill's "Rules" section in
     tone, covering: never use `--sr virtual` here, never click a flagged destructive
     control, keep the inventory current with one coordinator writer, save after
     every page and phase change so the run can be resumed where it left
     off, always warn before a real screen reader session, treat a reused hint as
     something to re-verify - never as settled fact, state the test method next to every
     claim (inherited from the existing skill, restated because this skill may be loaded
     without the other one).
4. Keep the file under ~500 lines; push anything long-form into `resources/` (T-13) and
   link to it, per the spec's progressive-disclosure guidance.
5. Add `packages/skills/full-site-audit/agents/openai.yaml`, mirroring
   `packages/skills/a11ied/agents/openai.yaml`'s two fields.

### T-13 - Skill resources

**Step-by-step instructions:**

1. Create `packages/skills/full-site-audit/resources/run-state-and-decisions.md` with one
   annotated inventory example, the resume procedure by phase, the versioned skill-owned
   hints shape, the authentication handoff, artifact privacy choice, sampling language,
   and the branching decisions from FR-1, FR-5, FR-6, FR-9, FR-12, and FR-21.
2. Link to the Zod schemas for field-level truth instead of copying every field into prose.
   Keep examples focused on agent-authored values such as template groups and hints.

### T-14 - Register the skill

**Step-by-step instructions:**

1. Add an entry to `packages/skills/ai.json`'s `skills` map:
   `"full-site-audit": { "path": "./full-site-audit/" }`.
2. Confirm `packages/skills/full-site-audit/SKILL.md` validates against the spec
   (name/description constraints) the same way `add-skill.md`'s workflow already expects;
   run the `skills-ref validate` command referenced in the spec if it is available in this
   environment, otherwise hand-check the constraints listed in T-12 step 2.

### T-15 - Cross-link from the existing `a11ied` skill

**Step-by-step instructions:**

1. In `packages/skills/a11ied/SKILL.md`, add a short paragraph (3-5 sentences, not a new
   top-level section) near the top, after the introductory paragraph, pointing to the new
   skill by name for "an entire site or a large section of one," so an agent that loads
   the general skill first is redirected instead of trying to improvise site-wide
   orchestration inside the wrong skill.
2. Do not duplicate the new skill's content here; one sentence naming what it covers is
   enough.

### T-16 - Docs site pages

**Step-by-step instructions:**

1. In `packages/docs`, find the existing command-reference page pattern (the pages
   documenting `a1 audit`, `a1 axe`, etc.) and add matching pages for `a1 audit discover`
   and `a1 report build`, using the same page frontmatter/layout.
2. Add one skill-overview docs page for `full-site-audit`, following whatever page (if
   any) already documents the `a11ied` skill bundle; if none exists yet, model the new
   page on the command-reference pages' tone (procedural, command examples, no marketing
   language), consistent with `internal-docs/research/impeccable-skills-analysis.md`'s
   critique of vague, hand-wavey docs copy. Mention resumability and the hints file
   briefly; both are part of what makes this skill different from a one-shot script.
3. Run `npm run dev:docs` and manually check both new pages render, then stop the dev
   server.

### T-17 - Release readiness doc update

**Step-by-step instructions:**

1. In `internal-docs/releases/v0.1.0-readiness.md`'s "agent skill" section, add two lines
   mirroring the existing three, for `packages/skills/full-site-audit/`: review `SKILL.md`
   against released CLI/MCP behavior, review `agents/openai.yaml`, publish the bundle
   together with the docs update.

### T-18 - Discovery unit tests

**Step-by-step instructions:**

1. Cover, across `sitemap.test.ts`, `robots.test.ts`, `crawl.test.ts`, `resolve.test.ts`,
   and `runtime.test.ts` (T-02 through T-04's per-module tests, consolidated here as one
   acceptance pass):
   - A sitemap index that points at two child sitemaps resolves all of their URLs.
   - `robots.txt` `Disallow` rules exclude matching paths from crawl fallback.
   - A redirect chain resolves to its final URL and status.
   - A page with a `canonical` link folds into that canonical URL's record.
   - A resolved page's `title`/`headingSample` are captured from the same fetch that reads
     its canonical link, not a second request.
   - A full-audit run with `probeErrorPages: true` adds a 404-probe page record; a page
     that already returned 500 during discovery is retained in scope, not dropped.
   - The resulting inventory's `templateId`/`templates` are unset/empty (this layer never
     assigns them).
   - `discoverSite` calls `onProgress` more than once for a fixture site large enough to
     span more than one batch.
   - `discoverSite` called with `resumeFrom` set to a partial inventory does not
     re-resolve any URL that inventory already resolved to a terminal status, and
     preserves that inventory's existing `pageId` values unchanged.
2. Run `npm test --workspace @a11ied/core -- discovery`.

### T-19 - Report aggregation/render tests

**Step-by-step instructions:**

1. `aggregate.test.ts`: two fixture CLI-envelope audit files with known outcomes produce
   the expected complete `ReportModel`; the merged EARL report's `@graph` length
   equals the sum of both pages' individual assertion counts.
2. `render-html.test.ts`: the rendered HTML contains the expected summary figures,
   correctly reflects a fixture inventory's pre-assigned `templates` grouping in its
   per-template summary, and parses cleanly.
3. `render-pdf.test.ts`: the rendered file exists and is a valid PDF by magic bytes.
4. Add one real Vitest test (not a standalone script, per the "no ad-hoc test scripts"
   rule) that runs `a1 audit`'s underlying logic (via `@a11ied/core`'s
   `buildAuditReport`, in-process, not by shelling out) against a fixture render of
   T-08's HTML output and asserts zero violations, satisfying NFR-3 as an automated check
   rather than only a manual one.

### T-20 - CLI + MCP handler tests

**Step-by-step instructions:**

1. `handlers-audit-discover.test.ts`: covers `a1 audit discover` against a fixture server,
   `--json` and text output, `--out` file writing (asserting it is updated more than once
   across a multi-batch fixture run, per T-04's `onProgress`), `--resume-from` skip
   behavior, and the empty-result exit code.
2. `handlers-report.test.ts`: covers `a1 report build` against a fixture inventory +
   fixture per-page `audit.json` files, all four output files, `--formats` filtering
   (confirming `json` is always produced), and `--fail-on` exit-code behavior.
3. Extend the MCP server's existing test harness (`packages/mcp-server/src/testing/
harness.ts`) coverage for the two new tools, following `sr.test.ts`'s/`index.test.ts`'s
   existing shape.
4. Run `npm test --workspace @a11ied/cli` and `npm test --workspace @a11ied/mcp-server`.

### T-21 - Manual verification

**Step-by-step instructions:**

1. From the repo root:

   ```sh
   npm run standards
   npm test
   ```

2. Build the CLI so the MCP server can launch: `npm run build --workspace packages/cli`.
3. Pick a small, real, low-risk site (or a local fixture site already used elsewhere in
   this repo's examples/tests) with under 50 pages. Run the full flow by hand:

   ```sh
   a1 doctor --strict
   a1 audit discover https://example-fixture-site.test \
      --out .a11ied/audits/manual-check/inventory.json --json
   ```

4. Hand-edit `inventory.json` to assign `templateId`/`templates` for at least two pages
   that clearly share a template, confirming the file re-parses cleanly afterward
   (exercises the T-12 "template review" step by hand). Set its `run.phase` to `auditing`
   and verify `readInventory` still accepts it.
5. For 3-4 representative pages, run the per-page loop from T-12's "Per-page loop" section
   by hand (including one real screen-reader session, watching for the takeover warning
   and confirming it is accurate). Partway through the third page - after recording at
   least one `a1 audit record` result but before that page's final `a1 audit --format json
--out` call - stop the process (Ctrl+C, or kill the shell) to simulate a crash.
6. Start a fresh shell/session and re-run the skill's preflight/resume check by hand:
   confirm `.a11ied/audits/manual-check/inventory.json` is found and reports the correct
   `run.phase` and page counts; confirm `a1 sr status`/`a1 doctor` correctly reports (and
   allows cleaning up) any screen-reader session left active by the interrupted process;
   confirm `a1 audit pending <the-interrupted-url>` reflects the evidence already recorded
   before the interruption; finish that page and continue the loop for the rest.
7. Build the report:

   ```sh
   a1 report build --inventory .a11ied/audits/manual-check/inventory.json \
      --results-dir .a11ied/audits/manual-check/pages \
      --out .a11ied/audits/manual-check/report
   ```

8. Open `report.html` and `report.pdf` and confirm they are readable, correctly reflect
   the hand-assigned template grouping and the manual findings, and do not look like
   generic AI-generated scaffolding (check against the anti-patterns list in
   `internal-docs/research/impeccable-skills-analysis.md`: no pill nav, no blur-card soup,
   no gradient text, obvious hierarchy).
9. Validate `report.earl.json` is well-formed JSON-LD with one assertion per checked
   criterion per page, and that `report.json` alone carries enough detail that a
   hand-written alternate render (even a quick one) would not need anything else.
10.   Confirm `.a11ied/sites/<origin-key>/hints.json` was created and contains at least the
      template grouping and any auth/destructive-action observations from this run.
      Manually edit one entry's `note` to something the site clearly contradicts (e.g., mark
      a public page as requiring auth), then run discovery again against the same host and
      confirm the write-up of that run's findings visibly treats the stale hint as something
      to re-check rather than repeating it as fact.
11.   Repeat discovery against a fixture requiring authentication. Use Playwright codegen
      to save storage state without exposing credentials, verify authenticated discovery and
      `a1 audit --storage-state` work, verify no output contains secret values, and verify an
      authenticated HTML/tree artifact is saved only after explicit consent.
12.   Delete the manual-check output directory and captured storage-state file (and, if it was created solely for this test,
      the `.a11ied/sites/<origin-key>/` hints directory) when done - these are local scratch
      artifacts, not repo files.

## New code

| File                                                                       | Purpose                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/contracts/src/schemas/discovery.ts`                              | `PageRecord`/`SiteInventory` zod schemas and types                                   |
| `packages/contracts/src/schemas/report.ts`                                 | Complete `ReportModel` Zod schema and type                                           |
| `packages/core/src/discovery/sitemap.ts`                                   | Sitemap/robots.txt fetch + parse                                                     |
| `packages/core/src/discovery/robots.ts`                                    | `robots.txt` `Disallow` parsing                                                      |
| `packages/core/src/discovery/crawl.ts`                                     | Same-origin crawl fallback via Playwright                                            |
| `packages/core/src/discovery/visit.ts`                                     | One rendered visit for redirects, signals, links, and optional artifacts             |
| `packages/core/src/discovery/runtime.ts`                                   | `discoverSite` (incremental writes, `resumeFrom`), `readInventory`, `writeInventory` |
| `packages/core/src/report/aggregate.ts`                                    | Multi-page summary + merged EARL builder                                             |
| `packages/core/src/report/render-html.ts`                                  | Self-contained HTML report renderer                                                  |
| `packages/core/src/report/render-pdf.ts`                                   | Playwright-based PDF renderer                                                        |
| `packages/cli/src/commands/audit-discover.ts`, `audit-discover-actions.ts` | `a1 audit discover` subcommand                                                       |
| `packages/cli/src/commands/report.ts`, `report-actions.ts`                 | `a1 report build` command                                                            |
| `packages/cli/src/renderers/audit-discover.ts`, `report.ts`                | Text renderers for both commands                                                     |
| `packages/mcp-server/src/tools/audit-discover.ts`, `report-build.ts`       | MCP tool wrappers                                                                    |
| `packages/skills/full-site-audit/SKILL.md`                                 | The new skill                                                                        |
| `packages/skills/full-site-audit/agents/openai.yaml`                       | Skill metadata for OpenAI-style agents                                               |
| `packages/skills/full-site-audit/resources/run-state-and-decisions.md`     | Resume, hints, auth, privacy, sampling, and decision reference                       |

Modified files: `packages/contracts/src/index.ts` (barrel exports); `packages/core/src/
audit/earl.ts` (export the per-page assertion-building helper for reuse); `packages/core/
src/index.ts` (re-export new engine entry points); `packages/cli/src/lib/options.ts`
(add the shared storage-state option); `packages/cli/src/commands/audit.ts` and
`audit-evidence.ts` (accept `--storage-state` where page loading occurs and register the `discover`
subcommand alongside the existing evidence subcommands); `packages/cli/src/program.ts`
(register the new `report` command); `packages/mcp-server/src/server.ts` (register two new
tools); `packages/mcp-server/src/registry-parity.test.ts` (two new parity entries);
`packages/skills/ai.json` (register the new skill); `packages/skills/a11ied/SKILL.md`
(cross-reference paragraph); `internal-docs/releases/v0.1.0-readiness.md` (agent skill
section).

## Tests

- Unit: every new `packages/core/src/discovery/*.ts` and `packages/core/src/report/*.ts`
  module gets a co-located `*.test.ts`, per this repo's testing convention (Arrange-Act-
  Assert, `describe()` blocks, a blank line before each `expect`, `.to.eql()` for deep
  equality, `.to.strictlyEqual(true/false)` for booleans - never `.to.be.true`).
- Contract: `packages/contracts/src/schemas/discovery.test.ts` and `.../report.test.ts`
  cover complete, partial, sampled, authenticated, and invalid data.
- CLI handler: `handlers-audit-discover.test.ts` (including `--resume-from` and
  incremental `--out` writes), `handlers-report.test.ts` in `packages/cli/src/testing/`,
  following the existing `handlers-audit-evidence.test.ts` shape (spawn/exercise the built
  command against fixtures, assert stdout shape and exit code).
- MCP: extend `packages/mcp-server/src/testing/harness.ts` coverage for the two new tools;
  `registry-parity.test.ts` must pass with both new commands mapped.
- Dogfooding: an automated test that runs `a1 audit`-equivalent logic in-process against
  the rendered HTML report and asserts zero violations (NFR-4), not left to manual
  verification alone.
- Resumability (T-04, T-18): `discoverSite`'s `resumeFrom` and `onProgress` behavior is
  covered by automated tests, not manual verification alone, since it is the mechanism the
  rest of resumability depends on.
- Manual/E2E (T-21): one full real-world run against a small fixture site, including a
  hand-assigned template grouping, a simulated crash and resume mid-audit (with a stale
  screen-reader session cleanup check), a hints file reuse/staleness check, and eyeballing
  the HTML and PDF output for both correctness and visual quality.

## Review checklist

Plan review:

- [x] All outstanding questions are answered in Assumptions & open questions.
- [x] Authentication, artifact privacy, scope, resume ownership, sampling claims, and
      report inputs have explicit contracts.
- [x] Every FR traces to a task and acceptance criterion.

Implementation acceptance:

- [ ] Does the CLI/MCP parity test (`registry-parity.test.ts`) pass with both new commands
      covered?
- [ ] Does the generated HTML report itself pass `a1 audit` with zero violations (NFR-4)?
- [ ] Does discovery respect `robots.txt` and stay within its concurrency cap against a
      real site (NFR-1, NFR-2)?
- [ ] Does authenticated discovery and auditing use only an ignored storage-state path,
      with no secret in chat, arguments, logs, inventory, hints, reports, or filenames?
- [ ] Does `report.json` alone carry every fact shown by the HTML render (FR-17)?
- [ ] Does an interrupted run resume without re-asking already-answered questions or
      redoing completed pages, and does it clean up a stale screen-reader session first
      (FR-20 through FR-23)?
- [ ] Does only the coordinator write `inventory.json`, using atomic replacement after
      each completed page and phase change (FR-8, FR-28)?
- [ ] Does a truncated discovery remain labeled partial, and do sampled pages remain
      `not-tested` rather than inheriting a representative page's result (FR-26, FR-27)?
- [ ] Does the skill produce and update `hints.json`, and does it visibly treat a reused
      hint as something to re-verify rather than as settled fact (FR-24, FR-25)?
- [ ] Does `npm run standards` and `npm test` pass at the repo root?
- [ ] Has the skill bundle been reviewed against the released CLI/MCP behavior per
      `internal-docs/releases/v0.1.0-readiness.md`'s existing agent-skill checklist?
