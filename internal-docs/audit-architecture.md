# Audit architecture

`a1 audit` runs an agent-driven WCAG audit. This document explains how it is built and
why. The user guide is `packages/docs/src/pages/guides/audit.astro`; the agent
instructions are in `packages/skills/a11ied-audit/`.

## Goals

- Track progress durably, so an audit survives agent crashes, context loss, and restarts.
- Run independent work in parallel.
- Make progress and problems visible to the person who started the audit.
- Keep a clear line between what a program decides and what an agent judges.
- Produce a short, organized report that a client can act on.
- Work at any scope: a site, a page, a state, a flow, one criterion, or a mobile app.

## Model

| Term      | Meaning                                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page      | One thing to test: a page, screen, state, or flow. `P1`, `P2`, and `site` for cross-page checks.                                                                              |
| Test pass | The criteria tested with one kind of interaction: `semantics`, `keyboard`, `visual`, `media`, `forms`, `pointer`, `consistency`. Every criterion belongs to exactly one pass. |
| Unit      | One pass on one page, such as `P3.keyboard`. The unit of claiming, leasing, and submitting.                                                                                   |
| Result    | The outcome of one criterion on one page: `pass`, `fail`, `not-applicable`, or `cannot-tell`, with a note.                                                                    |
| Finding   | One defect, with one occurrence per page it appears on. It records the criterion it fails, any others the same defect fails, and the reason it fails each one.                |
| Signal    | A fact a programmatic check collected about a page, shown to workers.                                                                                                         |
| State     | A condition a page can be put in: a menu or dialog open, a tab selected, a form showing errors. Every unit judges its criteria in each state, and records which it tested.    |

Units group by behavior because a page is loaded and exercised once per kind of
interaction. A whole-site AA audit of 25 pages is about 150 units, not 1,375 separate
criterion checks.

A criterion's standing across the audit is the worst of its page outcomes: fail, then
in progress, then not verified, then pass, then not applicable. An open finding always
means fail, whatever the recorded result says.

## Programmatic and judged

| Programmatic                                        | Judged by an agent                                           |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Page discovery from sitemaps and links              | Which pages, states, and flows are in scope                  |
| axe-core violations, recorded as findings           | Whether each automated finding is real, and what is wrong    |
| A list of controls that open or change a state      | Testing each state, and finding the ones the list misses     |
| Cropped, outlined screenshots of failing elements   | Which element fails, and the steps that show it              |
| Page measurements, stored as signals                | Every `pass` and `not-applicable`                            |
| Claims, leases, recovery, progress, report assembly | Failures a scanner cannot see, severity, impact, and the fix |

The rule: a programmatic check may record a failure it is certain of, and may collect
facts. It never records a pass. No heuristic in this repo covers enough cases to pass
a criterion, so none is allowed to. An agent may dismiss an automated finding on a
page with a reason, which is the only way a scanner failure stops counting.

The state list follows the same rule. The scan lists what markup says can change the page:
buttons that do not submit a form, `aria-expanded` and `aria-haspopup` controls, tabs,
`summary`, popover and command targets, frames, web components, and forms. It cannot see hover
content or a clickable `div`, so it is a floor, not proof of coverage. What makes it useful is
that submit rejects a unit that does not account for every listed state, so no listed state is
skipped by accident; a worker adds states the list missed, and an untested state shows in the
report as not verified.

Evidence is built the same way. A worker gives a selector for the failing element and the steps that show it
(a `screenshot` spec with a selector, viewport, zoom, clicks, keys, or hover). Submit replays
the steps in a browser and saves a crop of the element with an outline, before the submission
is validated, so a selector that matches nothing is rejected with the other problems. The scan
does the same for the first element of each axe finding. On web pages every occurrence needs a
picture. Full-page captures are kept out of findings because a thumbnail of a page tens of
thousands of pixels tall is too small to show anything.

## Storage

Each audit is a directory, `.a11ied/audits/<id>/`:

```txt
audit.db      SQLite database (WAL mode), the single source of truth
evidence/     screenshots and other files, one folder per unit
workers/      private screen reader session state, one folder per worker
report/       generated report files
```

SQLite comes from `node:sqlite`, so there is no dependency. It was chosen over JSON files
with lock files because parallel workers need atomic claims and all-or-nothing
submissions, and a transaction gives both. Every write runs in `BEGIN IMMEDIATE`, with a
ten-second busy timeout.

Tables: `meta` (config and schema version), `pages`, `units`, `results`, `findings`,
`instances` (occurrences of findings), `states` (the states each unit tested or left out),
`priorResults` (the outcomes a unit had before it
was last reopened), `signals`, and `events` (the activity log).
`db.ts` defines the schema and versioned migrations, so an audit in progress keeps working
after an upgrade.

## Resilience

- **Leases.** A claim lasts 20 minutes and any worker command on the unit extends it. An
  expired claim returns the unit to the queue the next time anyone asks for work.
- **Resume.** `a1 audit next` gives a worker the unit it already holds, so a worker that
  lost its context continues instead of starting something new.
- **Poison units.** A unit abandoned three times blocks itself with the reason, for a
  person to look at.
- **Local failure stays local.** A worker blocks a unit it cannot test at all, or records
  `cannot-tell` for the criteria it could not check. Neither stops other units.
- **Atomic submissions.** A submission is validated as a whole and stored in one
  transaction. A rejection lists every problem, so an agent fixes it in one attempt.
- **Consistency.** `fail` needs a finding; `pass` cannot coexist with an open finding on
  that page. These checks replace the evidence-receipt code the project used
  before, which cost more agent effort than the testing itself.
- **Explanations.** A new finding needs a reason for each criterion it fails: what the
  criterion requires and what the page does instead. An automated finding starts with the
  scanner's wording, which describes a rule. The worker that decides its criterion on a page
  must describe it in `confirm` or dismiss it, so the report never presents rule text as an
  auditor's reasoning. A note that refers to another page is rejected, because the report
  shows each note by itself.
- **Changing the page set.** Adding, including, or excluding a page puts finished
  site-wide units back in the queue, since their results compared a different set of
  pages.
- **Reopening keeps the past.** Reopening a unit moves its outcomes to `priorResults`, and
  the next worker's packet lists them with the reopen reason. A re-test starts from the
  earlier notes instead of from nothing.
- **Scan failures.** A page that fails to load is logged and skipped.

## Code map

| Path                                          | Role                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/audit/src/passes.ts`                | Test passes, their criteria, and web and mobile procedures                                        |
| `packages/audit/src/scope.ts`                 | Resolves a scope request to criterion ids; reads judging guidance from the WCAG procedure catalog |
| `packages/audit/src/db.ts`, `rows.ts`         | Database, schema, migrations, transactions, row parsing                                           |
| `packages/audit/src/pages.ts`, `units.ts`     | Pages, unit creation, claims, leases, block and reopen (`reopen.ts` resets a unit)                |
| `packages/audit/src/submit.ts`, `findings.ts` | Submission validation and storage; findings and occurrences                                       |
| `packages/audit/src/states.ts`                | State accounting against the scan's list, and stored states                                       |
| `packages/audit/src/status.ts`                | Outcomes per page, criterion standings, progress                                                  |
| `packages/audit/src/packet.ts`                | The work packet a worker receives                                                                 |
| `packages/audit/src/report/`, `dashboard/`    | Report model and renderers; live progress page                                                    |
| `packages/core/src/audit/scan/`               | The browser scan: axe findings with screenshots, signals, and the state list                      |
| `packages/core/src/audit/evidence.ts`         | Turns a submission's screenshot specs into cropped element pictures                               |
| `packages/core/src/audit/discover-pages.ts`   | Adds a site's pages to the audit                                                                  |
| `packages/core/src/capture/`                  | `a1 capture`: screenshots with focus and overflow facts; outlined element crops                   |
| `packages/cli/src/commands/audit/`            | CLI commands                                                                                      |
| `packages/mcp-server/src/tools/audit.ts`      | MCP tools over the same functions                                                                 |

`@a11ied/audit` has no browser dependency. Anything that drives a page lives in
`@a11ied/core`.

## Extending

- **A new programmatic check** goes in `packages/core/src/audit/scan/`. Add a signal kind
  for facts, and list it in the relevant pass's `signals`. Record a finding only for a
  failure that cannot be a false positive in any design.
- **A new test pass or a moved criterion** is an edit to `passes.ts`. The test in
  `audit.test.ts` checks that all 55 A and AA criteria are still covered.
- **Judging guidance** for a criterion lives in
  `packages/wcag-data/data/curated/desktop-procedures.json`; run
  `npm run generate --workspace @a11ied/wcag-data` after changing it.
- **A schema change** needs a new entry in `MIGRATIONS` in `db.ts`.
