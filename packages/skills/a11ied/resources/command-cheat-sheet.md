# Command cheat sheet

Every `a1` command this skill uses, and the MCP tool that matches it. Run `a1 help-all`
for the full option list. This page keeps the common ones copy-pasteable.

## Setup and diagnosis

```txt
a1 doctor
a1 doctor --task scan --strict
a1 doctor --task reader --sr voiceover --strict
a1 setup
```

`doctor --task scan` checks browser prerequisites. `--task reader --sr voiceover`
checks that reader; use `nvda` or `virtual` for the other targets. `--task audit`
checks desktop assessment prerequisites. Add `--recording` only when recording is
requested. `--strict` exits 3 when a required
step is missing. `setup` runs the Guidepup install and OS permission steps `doctor`
lists, then re-checks. MCP tool: `doctor` (no `--strict` equivalent, so check the
`ready` field in its result instead). MCP accepts `task`, `target`, and `recording`.

## WCAG lookup

```txt
a1 wcag 1.4.3
a1 wcag contrast-minimum
a1 wcag criteria --level AA
a1 wcag criteria --summary
a1 search "focus order"
a1 wcag rule color-contrast
```

| Command                                          | MCP tool        | Arguments                                      |
| ------------------------------------------------ | --------------- | ---------------------------------------------- |
| `wcag <id-or-slug>` / `wcag show <id-or-slug>`   | `wcag_show`     | `criterion` (required), `version`              |
| `wcag criteria [--level A\|AA\|AAA] [--summary]` | `wcag_criteria` | `level`, `summary`, `version`                  |
| `search <query> [--kind k] [--limit n]`          | `search`        | `query` (required), `kind`, `limit`, `version` |
| `wcag rule <axe-rule-id>`                        | `wcag_rule`     | `ruleId` (required), `version`                 |

## ARIA pattern lookup and check

```txt
a1 pattern combobox
a1 pattern combobox-select-only
a1 pattern list
a1 pattern role combobox
a1 pattern attribute aria-expanded
a1 pattern check http://localhost:3000 --pattern combobox-select-only --selector '#fruit'
```

| Command                                                        | MCP tool          | Arguments                                                         |
| -------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------- |
| `pattern <pattern-or-example-id>`                              | `pattern_show`    | `name`                                                            |
| `pattern list`                                                 | `pattern_show`    | omit `name`                                                       |
| `pattern role <role>`                                          | `pattern_find`    | `role`                                                            |
| `pattern attribute <attribute>`                                | `pattern_find`    | `attribute`                                                       |
| `pattern check <target> --pattern --selector`                  | `pattern_check`   | `target`/`html`, `pattern`, `selector`, `click`, `table`, `setup` |
| `pattern record <target> --pattern --row --selector --outcome` | `pattern_record`  | plus `click`, `note`, `mode`, `pointer`, `assertedBy`             |
| `pattern pending <target> --pattern`                           | `pattern_pending` | `target`/`html`, `pattern`                                        |

`pattern check` exits 4 on a key the example declares that changed nothing, and on an
attribute pointing at an id the document does not have. Everything else it prints is an
observation for you to judge.

## Page checks

```txt
a1 axe http://localhost:3000/checkout
a1 axe src/components/Dialog.html
a1 axe --html '<button></button>'
a1 tree http://localhost:3000/checkout --role button
a1 audit http://localhost:3000/checkout
```

`<target>` is an http(s) URL, a local file path, `-` for HTML on stdin, or `--html
'<markup>'`, on `axe`, `tree`, and `audit` alike.

| Command          | MCP tool  | Arguments                                                                                                                                                                  |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `axe <target>`   | `run_axe` | `target`/`html`, `criterion`/`level`/`ruleIds` (at most one), `selector`, `exclude`, `waitFor`, `click`, `viewport`, `headers`, `cookies`, `failOn`, `baseline`, `version` |
| `tree <target>`  | `tree`    | `target`/`html`, `role`, `name`, `click`                                                                                                                                   |
| `audit <target>` | `audit`   | `target`/`html`, `failOn`, `baseline`, `version`                                                                                                                           |

`axe` and `audit` exit 4 on a violation at or above `--fail-on` (default `minor`) not
covered by `--baseline`. The MCP tools return the matching `verdict` and `exitCode`.

## Saved reports

```bash
a1 report build \
   --inventory .a11ied/audits/createdbyfireside-com/inventory.json \
   --results-dir .a11ied/audits/createdbyfireside-com/pages \
   --out .a11ied/audits/createdbyfireside-com/report --draft
```

Report builds stage and verify the selected files before replacing the published
directory. `report.manifest.json` records file hashes, formats, and assessment
completion separately. After interruption, repeat the command to recover the
publication. Use a dedicated output directory outside audit inputs and the
current working directory. The same behavior applies to MCP `report_build`.

## Assessment coordinator

A clean axe scan leaves criterion requirements unresolved. For durable assessment,
use the shared coordinator through CLI or MCP `audit_assessment`:

```bash
a1 audit run https://createdbyfireside.com --environment environment.json \
   --inventory .a11ied/fireside/inventory.json --json
a1 audit state <run-file> --input <observed-state-file> --json
a1 audit journey <run-file> --input <observed-journey-file> --json
a1 audit next <run-file> --json
a1 audit status <run-file> --offset 0 --limit 20 --json
a1 audit record <target> --run <run-file> --results <evidence-file> \
   --wcag 2.2 --criterion <criterion-id> --procedure <procedure-id> \
   --outcome <outcome> --provenance <provenance-file> --mode semiAutomatic --json
a1 audit evaluate <run-file> --check <check-id> --outcome <outcome> \
   --evidence <saved-evidence-id> --json
a1 audit block <run-file> --check <check-id> --reason '<specific blocker>'
a1 audit resume <run-file> --retry <check-id> --json
a1 audit finalize <run-file> --json
```

Use the paths returned by startup. With an inventory, startup links its run ID
without JSON edits. Each `next` claims one obligation; execute the returned
procedure before recording. Read every status page through `nextOffset`.

MCP `audit_assessment` uses the corresponding `action` and `file`. Start supplies
structured `target`, `environment`, optional `inventoryPath`, profile, and policy.
State, journey, and queue actions supply their structured input. Evaluate supplies
`checkId`, `outcome`, and `evidenceIds`. Resume accepts explicit `retryCheckIds`.
Finalize accepts `allowPartial`; unresolved work keeps the run active.

MCP `record_result` accepts `runFile`, explicit `resultsFile`, `criterionId`,
`procedureId`, `outcome`, `mode`, `provenance`, and optional `finding`. `--run` alone
does not select the coordinator's evidence log. Use its returned `evidenceFile`.

For artifact identity, freshness, envelopes, and recovery details, read
[run state and decisions](../../full-site-audit/resources/run-state-and-decisions.md).
`audit pending` is a low-level criterion listing, not the coordinator's completion
signal. `cantTell` remains unresolved. Do not drain that listing with guessed notes.

Use `--finding finding.json` on `audit record` or `pattern record` to include a
finding title, user impact, and remediation in the report. The MCP recording tools
accept the same object as `finding`:

```json
{
   "title": "Focus remains trapped in the navigation menu",
   "userImpact": "Keyboard users cannot reach the page content after opening the menu.",
   "remediation": "Let Tab leave the menu and restore focus to the trigger when it closes.",
   "impact": "serious"
}
```

`remediation` and `impact` are optional. Omitted severity is reported as not assessed.
Record only details supported by the assessment. Completion still requires current run,
state, action, and artifact provenance and an evaluated check that references the evidence.

Record only actual observations. Structural evidence validation does not establish
truth or correct WCAG judgment. A passing scan or an emptied queue cannot establish
complete assessment coverage.

## Screen reader session

```txt
a1 sr start --sr virtual http://localhost:3000/checkout
a1 sr open http://localhost:3000/settings
a1 sr status
a1 sr stop --out transcript.md
```

| Command                | MCP tool action                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `sr start [url]`       | `sr_session` `{ action: "start", target, allowVirtual, url, app, browser, recording, idleTimeoutMinutes }` |
| `sr open <url>`        | `sr_session` `{ action: "open", url }`                                                                     |
| `sr stop [--out path]` | `sr_session` `{ action: "stop", out, format }`                                                             |
| `sr status`            | `sr_session` `{ action: "status" }`                                                                        |

## Screen reader actions

```txt
a1 sr read
a1 sr next heading
a1 sr previous
a1 sr press Tab Tab
a1 sr type "audit@createdbyfireside.com"
a1 sr checkpoint before-submit
a1 sr do move-right --sr voiceover
a1 sr find "Continue"
a1 sr goto --role button --name "Place order"
a1 sr wait --for "Order placed" --since before-submit
a1 sr expect --since before-submit "Order placed"
```

Every row below is one `sr_action` call: `{ action: "<name>", payload: {...} }`. Actions
with no payload column take none.

| Command                           | `sr_action` action | Payload                                                             |
| --------------------------------- | ------------------ | ------------------------------------------------------------------- |
| `sr read`                         | `read`             | none                                                                |
| `sr title`                        | `title`            | none                                                                |
| `sr next [kind]`                  | `next`             | `{ kind?, level?, times? }`                                         |
| `sr previous [kind]`              | `previous`         | `{ kind?, level?, times? }`                                         |
| `sr interact`                     | `interact`         | none                                                                |
| `sr stop-interacting`             | `stop-interacting` | none                                                                |
| `sr activate`                     | `activate`         | none                                                                |
| `sr top`                          | `top`              | none                                                                |
| `sr bottom`                       | `bottom`           | none                                                                |
| `sr escape`                       | `escape`           | none                                                                |
| `sr find <text>`                  | `find`             | `{ text }`                                                          |
| `sr table <move>`                 | `table`            | `{ move }`                                                          |
| `sr goto --role r --name n`       | `goto`             | `{ role?, name?, max? }`                                            |
| `sr elements <kind>`              | `elements`         | `{ kind, max? }`                                                    |
| `sr read-all`                     | `read-all`         | `{ max? }`                                                          |
| `sr press <chord...>`             | `press`            | `{ keys }`                                                          |
| `sr type <text>`                  | `type`             | `{ text }`                                                          |
| `sr do <command>`                 | `perform`          | `{ command, commandSet? }`                                          |
| `sr focus --app name`             | `focus`            | `{ appName? \| bundleId? \| processName? \| pid? \| windowTitle? }` |
| `sr screenshot <path>`            | `screenshot`       | `{ path }`                                                          |
| `sr wait --for text`              | `wait`             | `{ for?, since?, ms?, timeoutMs? }`                                 |
| `sr checkpoint <label>`           | `checkpoint`       | `{ label }`                                                         |
| `sr transcript` (raw, unfiltered) | `transcript`       | none                                                                |

`find`, `goto`, and `wait` return `exitCode` 4 when they did not match.

## Checks with no per-step tool

```txt
a1 sr list --query heading
a1 sr expect "Order placed"
a1 sr transcript --since before-submit --tail 5
```

| Command                                                      | MCP tool        | Arguments                                        |
| ------------------------------------------------------------ | --------------- | ------------------------------------------------ |
| `sr list [--query text] [--sr reader] [--command-set set]`   | `sr_list`       | `query`, `sr`, `commandSet`                      |
| `sr expect <text\|/regex/> [--since checkpoint] [--not]`     | `sr_expect`     | `pattern` (required), `since`, `not`             |
| `sr transcript [--since c] [--tail n] [--out path]`          | `sr_transcript` | `since`, `tail`, `out`, `format`                 |
| `sr tail [--lines n] [--since c] [--interval ms] [--phrase]` | CLI only        | stream live announcements (NDJSON with `--json`) |

## Not exposed over MCP

`a1 sr batch <file>` runs JSON-lines actions from a file in one process. Call `sr_action`
once per line instead. `a1 sr walk [url]` starts a session (if needed), reads the whole
page, and prints the transcript. Call `sr_session` (`start`), `sr_action` (`read-all`),
then `sr_transcript` in that order for the same result. `a1 sr tail` streams real-time
announcements continuously in a terminal.
