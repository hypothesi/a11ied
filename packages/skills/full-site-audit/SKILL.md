---
name: full-site-audit
description: Perform a resumable WCAG 2 desktop audit of a page, section, site, or desktop app with the a11ied CLI or MCP. Use the assessment coordinator to discover states and complete journeys, execute procedures with observed evidence, and publish reports with explicit coverage gaps. Use a11ied for a component development check.
---

# Complete desktop accessibility audit

Use the host agent's reasoning and a11ied's durable assessment coordinator together.
The coordinator assigns obligations and validates proof. The host agent observes the
product, performs each procedure, and judges its result. A scanner run starts the
assessment; it does not finish it.

Use VoiceOver, NVDA, or virtual execution as the task requires. Virtual observations
remain simulated. Procedures requiring `real-reader` need an actual native session.
Keep mobile execution outside this workflow.

Native sessions default to `nativeInput: guarded`. Observe the current item,
foreground window, keyboard focus when available, and transcript before choosing
an action. Commands check the observed target; typing checks between characters.
Ordinary actions return current state and at most 200 new transcript entries.
Use the returned cursor to fetch remaining entries. Status returns a recent bounded
tail. Explicit transcript queries retain full or selected history.
After each action, inspect fresh state and speech to confirm its effect. On a
focus mismatch or uncertain delivery, read state, refocus deliberately, and
inspect the control before continuing. Never replay a submission blindly.
Native cursor identity can be unavailable without blocking an adaptive audit.
Record actual session, speech, action, and artifact receipts; disclose observation
limits. `require-binding` is an optional strict policy that refuses unavailable
binding. `development` bypasses target checks. Virtual output cannot replace
required real-reader evidence.

Read [run state and decisions](resources/run-state-and-decisions.md) for command
inputs, provenance, authentication, recovery, and report limitations.

## Continue or start

Reuse the user's target, WCAG profile, scope, and authorized actions. A request for a
full site means site scope. Ask only for a missing decision that affects the work.

If the conversation identifies an existing run, inspect it with `audit status`.
Reuse its returned `file`, `evidenceFile`, `artifactsDir`, and stored policy. Read all
status pages through `nextOffset`; the first response contains at most 20 entries.
An inventory's old `audited` flags do not establish completed assessments.

If no run was identified, inspect matching local runs before creating another.
If several runs could match and the intended one is unclear, ask which to use.
Never overwrite an unrelated coordinator or discard saved work.

Run `a1 help-all` or inspect MCP input schemas for unfamiliar commands. Use available
MCP tools or the CLI interchangeably; both use shared core assessment operations.

## Observe the environment

Run task-specific diagnostics before using that capability. A scan does not need
screen reader or recording setup. Before native interaction, inspect `a1 sr status`
and the intended browser/app window. Do not stop a session owned by another task.

Record observed platform, OS, browser, reader version, capabilities, and limitations
in environment JSON. Do not declare a capability merely because it is installed.
Confirm actual target document identity, usable keyboard input, and reader speech.
Warn once before starting VoiceOver or NVDA because it controls desktop focus and
speech. Reuse an already acknowledged warning for the same session.

Before an action, confirm the target control and applicable run policy. Submission
and destructive actions default to disabled. A saved policy describes authorization;
it does not grant new permission or automatically prevent every low-level action.

## Discover scope and create the coordinator

For a website, run discovery into a dedicated run directory:

```bash
a1 audit discover https://createdbyfireside.com --scope site \
   --out .a11ied/fireside/inventory.json --json
a1 audit run https://createdbyfireside.com --environment environment.json \
   --inventory .a11ied/fireside/inventory.json --json
```

Startup retains discovery's run ID and links sibling `run.json` automatically.
Use the returned paths for every following command. Do not edit inventory phases,
page statuses, template groups, or assessment identities by hand.

Discovery limits, failures, and unresolved URLs remain coverage gaps. Resume
unfinished discovery with `--resume-from`. A large inventory is more work, not an
implicit license to sample. If the user narrows scope, disclose unassessed pages.
The coordinator checks every inventoried page; template similarity cannot certify
pages the agent did not assess.

For a desktop app, start with `audit run --app <target> --environment <file>`.
Observe its screens and processes through the existing desktop tools. Scanner and
website discovery commands cannot substitute for native app observations.

## Discover states and journeys

Visit every scoped page or app screen. Inspect content, controls, menus, dialogs,
forms, errors, loading states, and dynamic updates that actually exist. Follow
complete user processes across pages; a URL list cannot capture these behaviors.

Register each observed state with `audit state <run> --input <file>`. Supply its
actual target, label, environment, setup, fingerprint, and registered artifacts.
Use the returned `mutation.stateId`. Preserve stable state IDs when updating an
observation. A changed fingerprint revokes old proof; do not keep it to preserve a
pass. Adding artifact paths to the same fingerprint preserves observation identity.

Register ordered process states with `audit journey <run> --input <file>`. Mark a
journey completed only after observing its intended result. If an authorized step
cannot be performed, save the specific blocker and stop that journey safely.

The coordinator derives catalog obligations from observed scope. Use `audit queue`
for an additional widget or element obligation supported by the procedure catalog.
An element check supplements the required state assessment; it cannot replace it.

## Perform the assessment loop

1. Read `audit status <run> --json` and its coverage issues.
2. Call `audit next <run> --json` to claim one obligation.
3. Read the returned procedure's applicability, setup, actions, evaluation rules,
   required evidence, recovery guidance, and limitations.
4. Restore the referenced state or journey and confirm current target identity.
5. Perform the actual procedure in its declared environment. Capture observations
   and actions after the claim starts; use bounded transcripts and checkpoints.
6. Judge the result against the procedure and normative WCAG requirement.
7. Save evidence with `audit record`, explicit `--run` and `--results`, and current
   provenance, including the claimed attempt generation. Use `semiAutomatic` for agent work.
8. Accept the saved evidence with `audit evaluate`, its exact check ID, outcome,
   and returned evidence IDs. Resolve any validation rejection before proceeding.
9. Read status again, discover missing scope, and continue with the next obligation.

A second `next` cannot bypass an active claim. Do not batch guesses, manufacture
transcripts, or replace observations with notes. Scanner success, transcript text,
and criterion judgment are distinct evidence.

For `inapplicable`, observe the absence required by the procedure and explain it.
For `cantTell`, document the real attempt, observations, and specific uncertainty.
`cantTell` remains unresolved; it never completes the audit. If the environment or
an unauthorized action prevents an attempt, block the check with its reason.
Do not fill every pending criterion with the same blocker.

If `next` returns no check, inspect coverage issues and unsupported obligations.
No queued work does not imply completion. Missing capabilities, pages, states,
journeys, scanner coverage, or artifacts still require work or a disclosed gap.

## Recover and hand off

After interruption, inspect status, current UI identity, and saved evidence.
Run `audit resume <run>` to preserve interrupted work as blocked. Restore a safe
state before explicitly retrying selected check IDs. Do not replay completed work
or submit a form twice just to recreate a transcript.

Before context compaction, save the run path, target/profile, active check ID,
current UI/session identity, artifact paths, transcript cursor, and next safe action
in the task handoff. Keep authorization decisions with their scope. Resume by
reading runtime status; a prose handoff cannot override current validation.

Stop only the reader session this task owns before yielding desktop control.
Keep unresolved blockers and recovery actions in the coordinator.

## Publish results

For website previews, use one command:

```bash
a1 report build --inventory .a11ied/fireside/inventory.json \
   --results-dir .a11ied/fireside/pages --out .a11ied/fireside/report --draft
```

Keep page scanner artifacts under `pages/<pageId>/audit.json`. Pass the run's exact
profile and `evidenceFile` to page audits. Missing scans remain unresolved even
when behavioral findings are valid.

```bash
a1 audit <page-url> --wcag <version> --level <level> --results <evidence-file> \
   --format json --out <pages-dir>/<pageId>/audit.json
```

Use discovered page IDs for the output directories. The CLI writes the envelope
the report loader expects; do not replace it with a raw scanner result.

Call `audit finalize <run>` only after status reports complete validated coverage.
Then build without `--draft`. Partial finalization preserves unresolved work and
keeps the run active. Report generation never establishes assessment completion.

Verify the generated manifest and selected HTML/PDF/JSON/EARL files. Link the files
and describe unresolved scope beside them. A report threshold exit code of 4 means
findings met the threshold; inspect output before treating it as generation failure.
Report publication can be retried after interruption without rebuilding proof.

The bundle builder requires a website inventory. For a native app, preserve the
assessment and report this publication limitation explicitly; do not invent a web
inventory or claim a native report was generated.
