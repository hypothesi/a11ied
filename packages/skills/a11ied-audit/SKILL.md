---
name: a11ied-audit
description: Run a WCAG accessibility audit of a website, page, feature, or mobile app with the a1 CLI or the a11ied MCP tools, from scoping to a client-ready report. Use for any request to audit, assess, or report on WCAG conformance, at any scope, from one criterion on one page to a whole site at Level AA. Tracks progress durably, runs workers in parallel, and resumes after interruption.
---

# a11ied audit

You are the lead auditor. You scope the audit, start parallel workers, keep them moving, review
their findings, and deliver the report. The `a1 audit` commands hold all state in
`.a11ied/audits/<id>/`, so nothing depends on this conversation surviving.

Workers follow [the worker guide](resources/worker.md). Read it once: you will hand it to each
worker, and you follow it yourself when you cannot start workers. For a mobile app, also read
[auditing a mobile app](resources/mobile.md).

## CLI or MCP

The audit runs the same way through the `a1` CLI or the a11ied MCP server. Use whichever you have. Neither needs the
other, and a lead and its workers can mix them: both read and write the same audit.

- **CLI.** Run `a1 audit ...` in a shell. When `a1` is not on the PATH, run `npx -y a11ied audit ...`.
- **MCP.** When the server is connected, call the `audit_*` tool in place of the command.

This skill and the worker guide write each step as a CLI command. Over MCP, use this table.

| CLI command                                 | MCP tool                                    |
| ------------------------------------------- | ------------------------------------------- |
| `audit init`, `audit list`                  | `audit_init`, `audit_list`                  |
| `audit page add/list/exclude/include`       | `audit_page`                                |
| `audit discover`, `audit scan`              | `audit_discover`, `audit_scan`              |
| `audit next`, `audit show`, `audit submit`  | `audit_next`, `audit_show`, `audit_submit`  |
| `audit note`, `audit block`, `audit reopen` | `audit_note`, `audit_block`, `audit_reopen` |
| `audit limitation`                          | `audit_limitation`                          |
| `audit status`, `audit log`                 | `audit_status` (`log: true` for the log)    |
| `audit findings`, `audit finding show`      | `audit_findings`                            |
| `audit finding dismiss/merge/update`        | `audit_finding`                             |
| `audit signals`, `audit report`             | `audit_signals`, `audit_report`             |

What differs over MCP:

- `audit_next` takes `passes` and `excludePasses` where the CLI takes `--pass` and `--not-pass`.
- `audit_submit` takes the result as its `submission` argument. There is no file to write.
- `a1 audit dashboard` has no tool. With a shell, start it as described under "Offer the live dashboard". Without one,
  give the user the command to run themselves, and give progress from `audit_status`.
- One MCP server holds one screen reader session, and subagents usually share their lead's server. Two workers must
  never use the `sr_*` tools at the same time. Give one worker `passes: ["semantics"]`, give the others
  `excludePasses: ["semantics"]`, and tell the others to use `tree` and `capture` where they would use a screen reader.
  A worker that can run shell commands avoids this limit: `a1 sr` with the `A11IED_STATE_DIR` from its work packet
  gives it a private session.

## The model

- A **page** is one thing to test: a page, a screen, a state of one (a dialog open, an error
  shown), or a flow (checkout from cart to confirmation).
- A **test pass** groups the criteria tested with one kind of interaction: `semantics`,
  `keyboard`, `visual`, `media`, `forms`, `pointer`, and the cross-page `consistency` pass.
- A **unit** is one pass on one page, such as `P3.keyboard`. Units are what workers claim.
  A worker decides every criterion in its unit: `pass`, `fail`, `not-applicable`, or
  `cannot-tell`.
- A **finding** is one defect. The same defect on ten pages is one finding with ten occurrences.

## What is automated and what is judged

| Automated, no agent needed                                                                                         | Judged by a worker                                                        |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Page discovery (`a1 audit discover`)                                                                               | Which pages, states, and flows are in scope                               |
| axe-core failures, recorded as findings with a cropped screenshot of the element (`a1 audit scan`)                 | Whether each automated finding is real, and what is wrong in plain words  |
| A list of the controls on each page that open or change a state                                                    | Testing every state, including ones the list misses                       |
| Cropped, outlined screenshots of failing elements from a worker's `screenshot` spec                                | Which element fails and the steps that show it                            |
| Page measurements stored as signals: tab order, focus styles, reflow, target sizes, media inventory, form controls | Every `pass` and `not-applicable`, and every failure a scanner cannot see |
| Claims, leases, recovery of abandoned work, progress, report assembly                                              | Severity, user impact, and the recommended fix                            |

The scan never passes a criterion. A signal is a fact to verify, not a conclusion.

## 1. Scope

Take the scope from the request. Ask only for what is missing and cannot be defaulted:

- **Target** and platform. A URL means web. An app needs a build and a device or simulator.
- **Breadth**: whole site or app, a section, one page or screen, or one flow.
- **Criteria**: WCAG 2.2 Level AA unless told otherwise. `--criteria` or `--passes` narrows it.
- **Rules**: actions workers must not take. Ask about form submissions, purchases, account
  changes, and third-party widgets before any worker touches them. With no answer, forbid them.
- **Access**: test accounts, environments, feature flags.

```bash
a1 audit init https://example.com --name "Example site" \
   --rule "Do not submit the contact form" --rule "Do not place orders" \
   --access "Staging login in 1Password: Example QA"
```

One page: add `--page`. Chosen criteria: `--criteria 1.4.3,2.4.7`. Mobile: `--platform ios`.
With more than one audit in the workspace, `export A11IED_AUDIT=<id>` first.

## 2. Choose pages

Web: `a1 audit discover` adds every reachable page. Then make the set deliberate:

- Small site (up to about 30 pages): keep every page.
- Larger site: keep the home page, each distinct template, every page with a form or custom
  widget, the pages in key tasks, and a few others at random. Exclude the rest with the reason:
  `a1 audit page exclude P14 --reason "Same template as P9"`. The report lists exclusions.
- Add the states a page load does not show, and the flows that span pages:

```bash
a1 audit page add https://example.com/ --kind state --name "Home: menu open" \
   --notes "Activate the Menu button in the header"
a1 audit page add https://example.com/cart --kind flow --name "Checkout" \
   --notes "Cart > shipping > payment > review. Stop before placing the order."
```

Mobile: add each screen and flow with `a1 audit page add "<how to reach it>" --name ...`.

A `consistency` unit appears once the audit has two pages. It compares them all.

## 3. Scan

Web only: `a1 audit scan`. It runs every page in parallel, takes seconds per page, and is safe
to repeat. A page that fails to load is reported and skipped.

## 4. Run workers in parallel

Start as many workers as you have subagent slots and browsers the machine can run, usually 3 to 6. More workers than units is waste. Give each one a unique name and this prompt:

> You are an accessibility audit worker named `<wN>`. Audit: `<id>`. Work in `<repo dir>`.
> Follow the worker guide at `<absolute path to resources/worker.md>` exactly. Loop: run
> `a1 audit next --worker <wN>`, test the unit, submit it, repeat until the command says there
> is no work. Report only the units you finished and anything you blocked.

Resources that cannot be shared:

- **A native screen reader** (VoiceOver, NVDA) owns the machine's speech and keyboard. Give one
  worker `--pass semantics` and the others `--not-pass semantics`. The simulated reader
  (`--sr virtual`) runs in parallel freely.
- **A device or simulator** serves one worker. Give each mobile worker its own.

If you cannot start subagents, run the worker loop yourself. The audit still completes; it is
just serial.

## 5. Offer the live dashboard

`a1 audit dashboard` serves a page on the user's machine that updates as the audit runs:
progress by page and test pass, what each worker is testing, blocked units and what each
needs, the findings so far, and a link to the interim report.

When a person is in the conversation, offer it once, right after the workers start. Say what
it shows and ask whether they want it. Do not offer it when nobody is there to open it, such
as a CI job, a scheduled run, or a one-shot command with no prompt.

If they want it:

- Start `a1 audit dashboard` as a background process. It runs until it is stopped, so do not
  wait for it to finish. Add `--audit <id>` when the workspace has more than one audit, and
  `--port <port>` when port 4173 is in use.
- Give them the address it prints, `http://127.0.0.1:4173/` by default. The page is served
  from the machine that runs `a1`. Say so when the user reaches that machine remotely.
- With no shell, give them the command to run in their own terminal:
  `npx -y a11ied audit dashboard`.
- Leave it running while they read the report, and stop it when they are done with it.

If they decline, report progress from `a1 audit status` when they ask.

## 6. Keep it moving

`a1 audit status` shows units done, active workers, blocked units with reasons, and recent
activity.

- A worker that dies loses nothing. Its claim expires after 20 minutes and the unit returns to
  the queue. Start a replacement with a new name, or the same name to resume its unit.
- A **blocked** unit needs a person. Blocks never stop other units. When the queue is otherwise
  empty, collect every block, resolve what you can, and ask the user once for the rest. After a
  fix: `a1 audit reopen <unit> --reason "<what changed>"`.
- When a tool or device the audit needs is unavailable for every page, such as a screen reader
  or a physical phone, record it once: `a1 audit limitation "<what was not possible>"
  --criterion <id>`. The report lists it under Not verified.
- A unit blocked as "abandoned 3 times" defeated three workers. Read `a1 audit log --unit <id>`
  before reopening it, and consider splitting the page.
- Do not stop while units are queued or in progress. A finished tool call, a draft report, or a
  saved checkpoint is not the end of the audit.

## 7. Review the findings

Before reporting, read `a1 audit findings` as an editor:

- Merge duplicates: `a1 audit finding merge F3 F9 F12`.
- Dismiss what is wrong, with the reason: `a1 audit finding dismiss F7 --reason "..."`.
- Fix titles, severity, and wording that a developer could not act on:
  `a1 audit finding update F4 --severity serious --recommendation "..."`.
- Check that each finding explains itself. The problem says what happens for the user and why,
  with measured values. "Why it fails" says, for each criterion, what the criterion requires
  and what the page does instead. Rewrite one that does not:
  `a1 audit finding update F5 --reason "2.4.7=..." --description "..."`.
- Rewrite any automated finding that `a1 audit finding show` lists with "No reason recorded".
  It still has the scanner's wording, because no worker confirmed it. Describe it from its
  evidence, following "Writing notes and findings" in the worker guide, or dismiss it.
- Spot-check the critical and serious findings against their evidence. Reopen a unit whose work
  looks thin.

## 8. Report

```bash
a1 audit report
```

It writes `audit-report.html` (one self-contained file, printable to PDF), `.md`, and `.json`
to `.a11ied/audits/<id>/report/`. An audit with unfinished units produces an interim report that
says so. Tell the user: the verdict, the number of findings by severity, the top three issues,
anything not verified and why, and the report path. Do not restate the report.

## Resuming

After any interruption, run `a1 audit status`. It is the whole truth. Do not rebuild progress
from memory or chat history. Restart workers and continue from step 6. A dashboard started
before the interruption may have stopped: offer it again if the user was using it.

## Rules

- A criterion passes only when a worker tested it on that page. Never copy a pass from one
  page to another because they look alike.
- Never report conformance while any criterion is failing, unfinished, or not verified. The
  report states this for you; do not soften it.
- Stay inside the audit rules. A rule forbids an effect, such as sending a message, not the
  steps before it: client-side validation, confirmation steps, and cancel paths are still
  tested. Record `cannot-tell` only for what lies past the forbidden effect.
- A page includes every state it can reach. Workers account for each state the scan lists
  and add the ones it misses; an untested state shows in the report as not verified.
- Label simulated screen reader output as simulated. It does not establish VoiceOver or NVDA
  behavior.
