# Command cheat sheet

Every `a1` command this skill uses, and the MCP tool that matches it. Run `a1 help-all`
for the full option list. This page keeps the common ones copy-pasteable.

## Setup and diagnosis

```txt
a1 doctor
a1 doctor --strict
a1 setup
```

`doctor` reports browser and screen reader readiness. `--strict` exits 3 when a required
step is missing. `setup` runs the Guidepup install and OS permission steps `doctor`
lists, then re-checks. MCP tool: `doctor` (no `--strict` equivalent, so check the
`ready` field in its result instead).

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

| Command                                                        | MCP tool          | Arguments                                                |
| -------------------------------------------------------------- | ----------------- | -------------------------------------------------------- |
| `pattern <pattern-or-example-id>`                              | `pattern_show`    | `name`                                                   |
| `pattern list`                                                 | `pattern_show`    | omit `name`                                              |
| `pattern role <role>`                                          | `pattern_find`    | `role`                                                   |
| `pattern attribute <attribute>`                                | `pattern_find`    | `attribute`                                              |
| `pattern check <target> --pattern --selector`                  | `pattern_check`   | `target`/`html`, `pattern`, `selector`, `table`, `setup` |
| `pattern record <target> --pattern --row --selector --outcome` | `pattern_record`  | plus `note`, `mode`, `pointer`, `assertedBy`             |
| `pattern pending <target> --pattern`                           | `pattern_pending` | `target`/`html`, `pattern`                               |

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

| Command          | MCP tool  | Arguments                                                                                                                                                         |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `axe <target>`   | `run_axe` | `target`/`html`, `criterion`/`level`/`ruleIds` (at most one), `selector`, `exclude`, `waitFor`, `viewport`, `headers`, `cookies`, `failOn`, `baseline`, `version` |
| `tree <target>`  | `tree`    | `target`/`html`, `role`, `name`                                                                                                                                   |
| `audit <target>` | `audit`   | `target`/`html`, `failOn`, `baseline`, `version`                                                                                                                  |

`axe` and `audit` exit 4 on a violation at or above `--fail-on` (default `minor`) not
covered by `--baseline`. The MCP tools return the matching `verdict` and `exitCode`.

## Checks you have to perform yourself

axe decides 28 of the 86 WCAG 2.2 criteria. The other 58 need a person looking at the
page, and you can do many of them: read the accessibility tree, drive the screen reader,
or look at the rendered page. Record what you find so it reaches the same report.

```txt
a1 audit pending http://localhost:3000/checkout --level AA
a1 audit record http://localhost:3000/checkout --criterion 2.4.4 --outcome failed \
   --pointer 'nav > a:nth-child(3)' --note "Four links read 'Learn more'."
a1 audit http://localhost:3000/checkout --format earl --out report.earl.json
```

| Command                  | MCP tool               | Arguments                                                                                         |
| ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `audit pending <target>` | `list_pending_results` | `target`/`html`, `level`, `wcagVersion`, `resultsFile`                                            |
| `audit record <target>`  | `record_result`        | `target`/`html`, `criterionId`, `outcome`, `mode`, `procedureId`, `pointer`, `note`, `assertedBy` |
| `audit clear <target>`   | none                   | `target`/`html`                                                                                   |

Work the loop: call `audit pending` to see what is left, inspect the page for one
criterion, call `audit record` with what you found, repeat. `--outcome` takes `passed`,
`failed`, `cantTell`, or `inapplicable`. Use `cantTell` when you looked and still cannot
decide; it is an honest answer and it never contradicts anything.

Record only what you actually checked. A recorded result carries your name in
`assertedBy` and lands in the report as evidence, so a guess is worse than leaving the
criterion pending.

## Screen reader session

```txt
a1 sr start --sr virtual --allow-virtual http://localhost:3000/checkout
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
a1 sr type "jane@example.com"
a1 sr checkpoint before-submit
a1 sr do move-right --sr voiceover
a1 sr find "Continue"
a1 sr goto --role button --name "Place order"
a1 sr wait --for "Order placed"
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
| `sr wait --for text`              | `wait`             | `{ for?, ms?, timeoutMs? }`                                         |
| `sr checkpoint <label>`           | `checkpoint`       | `{ label }`                                                         |
| `sr transcript` (raw, unfiltered) | `transcript`       | none                                                                |

`find`, `goto`, and `wait` return `exitCode` 4 when they did not match.

## Checks with no per-step tool

```txt
a1 sr list --query heading
a1 sr expect "Order placed"
a1 sr transcript --since before-submit --tail 5
```

| Command                                                    | MCP tool        | Arguments                            |
| ---------------------------------------------------------- | --------------- | ------------------------------------ |
| `sr list [--query text] [--sr reader] [--command-set set]` | `sr_list`       | `query`, `sr`, `commandSet`          |
| `sr expect <text\|/regex/> [--since checkpoint] [--not]`   | `sr_expect`     | `pattern` (required), `since`, `not` |
| `sr transcript [--since c] [--tail n] [--out path]`        | `sr_transcript` | `since`, `tail`, `out`, `format`     |

## Not exposed over MCP

`a1 sr batch <file>` runs JSON-lines actions from a file in one process. Call `sr_action`
once per line instead. `a1 sr walk [url]` starts a session (if needed), reads the whole
page, and prints the transcript. Call `sr_session` (`start`), `sr_action` (`read-all`),
then `sr_transcript` in that order for the same result.
