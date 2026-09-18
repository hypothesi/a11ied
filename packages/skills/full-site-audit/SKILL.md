---
name: full-site-audit
description: Audit one page, a section, or a whole site against WCAG 2.2 Level AA with a1. Use for evidence audits that need discovery, template sampling, real screen reader checks, resumable progress, and HTML, PDF, JSON, and EARL reports. The workflow keeps untested and uncertain results explicit instead of claiming compliance from incomplete evidence.
---

# Full-site accessibility audit

Use this skill for a WCAG 2.2 Level AA evidence audit across one page, a section, or a
whole site. Use the separate `a11ied` skill for a component-level development loop.

Read [run state and decisions](resources/run-state-and-decisions.md) before starting. It
contains the inventory transitions, resume branches, authentication handoff, privacy
choice, sampling language, and hints format.

## Resuming an interrupted audit

Before asking about scope, normalize the target origin and inspect
`.a11ied/audits/*/inventory.json`. Find inventories for that origin whose `run.phase` is
not `complete`.

If one exists, ask whether to resume it or start a separate run. Never silently resume,
replace, or discard it. When resuming:

1. Load and validate the inventory.
2. Run `a1 sr status` and `a1 doctor` before any other work.
3. Stop and clean up any stale screen reader session.
4. Continue from the recorded phase and choices. Do not ask those questions again.
5. Skip pages marked `audited`.
6. For a page marked `in-progress`, start with `a1 audit pending <url>`. Recorded evidence
   survives in `.a11ied/evidence.jsonl`, so do not restart its checks from scratch.

## Scope

For a new run, ask whether the audit covers one page, a section, or the entire site. Do
not assume the entire site. A section uses the starting URL path as its default boundary.

Create one run directory:

```sh
.a11ied/audits/<timestamp>-<origin-key>/
```

Keep the inventory at `<run-dir>/inventory.json`, page results under
`<run-dir>/pages/<pageId>/audit.json`, and the report under `<run-dir>/report/`.

## Preflight

Run `a1 doctor --strict`. Confirm that `a1` works. Check the current tool list for the
a11ied MCP tools. If MCP tools are missing, use the CLI. In this repository, build the
CLI with `npm run build --workspace packages/cli` when the MCP server cannot start from
`.mcp.json`.

## Lessons from an earlier audit

If `.a11ied/sites/<origin-key>/hints.json` exists, read it before discovery. Each entry is
a hypothesis to check, not a fact. The site may have changed. Use a hint to decide where
to look first. Never use it to skip a check. Correct or invalidate a stale hint during
this run.

## Authentication and artifact consent

Start without authentication. Ask about a QA environment and sign-in only if discovery
finds a 401 or 403 response, a login redirect, or a password form.

Never ask for a username, password, cookie, token, or request header in chat or on a
command line. Open Playwright codegen and ask the user to sign in there and close the
window:

```sh
npx --no-install playwright codegen --save-storage=<ignored-local-path> <url>
```

Restrict the file to its owner where the platform supports that. Pass only the path with
`--storage-state`. Never read or print the file. Delete it after the run unless the user
asks to keep it. If the site stores authentication only in session storage, explain that
the capture cannot reproduce it and offer an interactive user-signed-in audit.

Separately ask once whether to save rendered HTML and accessibility trees. Explain that
these files may contain private page content. Record the choice in `inventory.json`.
Authenticated artifacts need an explicit yes. Reports do not embed the raw artifacts.

## Discovery

Set `run.phase` to `discovering`, then run:

```sh
a1 audit discover <url> --scope <page|section|site> \
   --out <run-dir>/inventory.json --json
```

Add the applicable `--storage-state`, `--include`, `--exclude`, `--artifacts-dir`, or
limit options. Discovery reads sitemaps and rendered same-origin links by default. Use
`--sitemap-only` only when the user requests it.

If discovery stops at a page, sitemap, time, or retry limit, keep
`discovery.complete: false` and its reason. Call it a partial inventory. Do not call it a
full-site audit.

For 50 or fewer deduplicated pages, audit every page unless the user narrows the scope.
For more than 50 pages:

1. Report the exact page count.
2. Review the URL, title, heading, and approved artifacts. Explain your current template
   assessment as a judgment, not a measured fact.
3. Estimate the full and sampled duration from the page and template counts.
4. Ask the user to choose a complete audit or a template-sampled audit.
5. Explain that sampling tests representative pages and observed variants. Every other
   page remains `not-tested`. Never claim those pages passed.

If the user chooses a complete audit, rerun discovery with `--probe-error-pages`. This
adds one synthetic 404 and retains pages that already returned 5xx. Never try to cause a
500 response.

Record the scope, audit mode, error-page probe choice, artifact choice, and parallel work
choice in `run.optionsChosen`.

## Template review

Set `run.phase` to `template-review`. Inspect representative pages and state or structure
variants. Do not infer a template from URL shape alone.

Write `pages[].templateId` and `templates` directly into `inventory.json`, then validate
the file again. Keep every sampled-out page at `auditStatus: not-tested`.

## Running inventory

Only the coordinator writes `inventory.json`. It atomically saves the file after every
phase transition and page completion. Parallel workers write only their assigned
`pages/<pageId>/audit.json`, then report completion to the coordinator.

## Parallel automated checks

If the runtime supports subagents, ask whether to parallelize the axe-only page audits.
Say plainly that screen reader checks cannot run in parallel because only one real screen
reader session can be active.

Each worker runs only:

```sh
a1 audit <url> --storage-state <path> --format json \
   --out <run-dir>/pages/<pageId>/audit.json
```

Omit `--storage-state` for public pages. The coordinator updates the inventory after the
worker returns.

## Browser and screen-reader readiness

Before starting VoiceOver or NVDA, orient in the browser first. Open the target with the browser automation path and verify all of the following:

- the browser process/window exists and is frontmost;
- the loaded URL matches the resolved target origin and path;
- the document has a non-empty title or visible body content;
- the page structure is observable (title, headings, landmarks, links, or controls).

A focus warning is a hard blocker, not a recoverable warning. Retry with the detected browser or an available alternate browser, then stop with an explicit environment failure if focus or URL verification still fails. Do not start a screen reader, run `sr walk`, or record manual outcomes until this gate passes. An empty transcript is not evidence that the page was read; treat it as a failed readiness check.

Only after browser readiness passes, before the first real screen reader session, warn the user:

> VoiceOver or NVDA will take over this machine's speech and keyboard focus. Do not try
> to exit the program while the audit runs. Keep the machine awake and unlocked until the
> session stops.

This audit never uses `--sr virtual` for compliance judgments. Use the real reader that
`a1 doctor` reports as available: VoiceOver on macOS or NVDA on Windows. The `a11ied`
skill's "Real screen reader vs. virtual" section explains the difference.

## Per-page loop

Set `run.phase` to `auditing` once. For each selected, non-duplicate page:

1. Mark the page `in-progress` and save the inventory.
2. Run `a1 audit pending <url>` to list hybrid and manual work still open.
3. Use one real screen reader session to gather the remaining evidence.
4. Record each judgment with `a1 audit record <url> --criterion <id> --outcome <outcome>`.
5. Run `a1 audit <url> --format json --out <run-dir>/pages/<pageId>/audit.json`.
6. Mark the page `audited`, add `auditedAt` and violation counts, and save the inventory.

Pass the storage-state path to discovery and audit calls for authenticated pages. For a
real screen reader, start on the login page, pause while the user signs in inside the
controlled browser, and keep that session open across pages.

Never activate a control flagged as destructive. This includes checkout, place order,
delete, remove, cancel subscription, and close account controls.

A page failure does not end the run. Mark that page `error`, record the reason, save, and
continue.

## Final report

Set `run.phase` to `report-building`, then run. Do not run this step while a page is `not-tested` or `in-progress`; resolve each selected page as `audited` or `error` first:

```sh
a1 report build --inventory <run-dir>/inventory.json \
   --results-dir <run-dir>/pages --out <run-dir>/report
```

After the command, verify each file is present and non-empty. If any file is missing, the report phase failed and the run must not be marked complete.

Confirm these files exist:

- `report.html`
- `report.pdf`
- `report.json`
- `report.earl.json`

Set `run.phase` to `complete` only after the report finishes. Tell the user where all four
files are.

The default HTML and PDF are not a constraint. If the user asks for a logo, brand colors,
or another layout, build a custom presentation from `report.json`. Use
`report.earl.json` when the presentation needs the standards assertion graph. This is
normal agent work, not an error fallback.

## Lessons for next time

Write or update `.a11ied/sites/<origin-key>/hints.json`. Record confirmed template groups,
pages that need authentication, destructive controls, sitemap or redirect quirks, and axe
findings worth checking again. Timestamp each entry and include this run's id. Correct or
invalidate stale entries. Tell the user the file exists and that a later run will
re-verify it.

## Rules

- Never use `--sr virtual` for a compliance judgment in this workflow.
- Never click or submit a flagged destructive control.
- Keep one coordinator as the only inventory writer.
- Save after every page and phase transition.
- Always warn before a real screen reader session.
- Re-verify every reused hint.
- State automated, hybrid, or manual next to every reported claim.
- Never turn a partial inventory or an untested page into a compliance claim.
