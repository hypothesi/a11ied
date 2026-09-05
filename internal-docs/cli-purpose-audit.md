# CLI purpose audit

Date: 2026-09-04. Scope: every released command, the MCP server, the agent skill, the
TypeScript library, and the docs site, measured against the stated purpose:

> An intuitive, DX-friendly CLI, MCP server, and agent skill for accessibility testing,
> used (1) in an agentic dev loop the way Playwright is, (2) to audit existing
> components and sites, (3) to write screen reader tests the way Vitest lets you write
> browser tests, (4) for standalone scripts, (5) to discover WCAG requirements, and (6)
> to understand WCAG and axe violations and how to fix them.

Every claim below was checked against the code or reproduced by running the built CLI
on this machine. File references are to the current `master`.

## Verdict in one paragraph

The pieces exist but they do not connect. There is a knowledge layer (`wcag`), a static
heuristic layer (`inspect`), and two automation layers (`axe`, `sr`), and nothing joins
them: no assertion, no verdict, no exit code, no "what do I do next" link. The `sr`
session model is a real achievement, but it has no test-authoring API, the virtual
target is jsdom without script execution, and state is stored per working directory.
The `wcag` data ships techniques and failures that no command shows, and the fix
guidance every developer wants still ends at a W3C URL. Use cases 1, 3, and 6 are not
served today; 2, 4, and 5 are half served. The good news: the contracts, the envelope,
the command registry, and the pinned data are solid foundations, and most of what is
missing is a layer on top rather than a rewrite underneath.

## Part 1. Bugs and reliability defects found

Ordered by how badly each undermines "dependable".

| #   | Defect                                                                                                | Where                                                                                                    | Evidence                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `a1 axe` exits 0 with violations present                                                              | `packages/cli/src/lib/execute.ts`                                                                        | `a1 axe --url https://example.com; echo $?` prints `0` with 1 violation. `cliExitCodes.assertion = 4` exists in `contracts/src/schemas/core.ts` and nothing produces it                                                                                                                               |
| 2   | `sr press` auto-start on virtual crashes and leaves a live session                                    | `packages/cli/src/lib/execute.ts` `runAutoStartAction`                                                   | `a1 sr press Tab --target virtual --allow-virtual` with no session: `broker-error: Cannot read properties of undefined (reading 'Symbol(Node prepared with document state workarounds)')`, exit 3, and `sr status` then shows the half-started session                                                |
| 3   | `sr do next` fails on virtual while `sr next` works, and `sr list --target virtual` advertises `next` | `packages/guidepup/src/virtual-adapter.ts` `virtualPerformCommand`, `packages/cli/src/commands/drive.ts` | `sr do next --target virtual --allow-virtual --ephemeral` returns `driver-command-target-unsupported`. Plan task T-06 in `plans/a11ied-driver-command-sets-plan.md` (route `next` through `perform`) was never done                                                                                   |
| 4   | Session state is per working directory                                                                | `packages/core/src/driver/session-utils.ts:26` (`resolve(cwd, '.a11ied', 'state')`)                      | An orphaned broker from an earlier directory (pid 19325, socket `/tmp/a11ied-drv_f9ccf3bd...sock`) is running right now and `sr status` from the repo root reports "No active session". `assertTargetIsAvailable` cannot see it either, so two VoiceOver sessions can be started from two directories |
| 5   | Orphaned brokers are never reaped except by a later `sr start`                                        | `packages/core/src/driver/broker-client.ts:258` (`detached`, `unref`)                                    | No TTL, no idle timeout, no `sr stop --all`, no `sr sessions`. A crashed agent leaves VoiceOver under automation control                                                                                                                                                                              |
| 6   | macOS recording calls `windowsRecord()` first and leaks its handle                                    | `packages/core/src/driver/recording.ts:101-165`                                                          | `createStopRecording` ignores `target` and returns `windowsRecord(path)`; the macOS branch then overwrites the variable                                                                                                                                                                               |
| 7   | Two hand-maintained speech-stabilization sets have drifted                                            | `driver/broker-actions.ts:12` vs `driver/runtime-internal.ts:38`                                         | `perform` is in the broker set and absent from the in-memory set. Which one runs depends on `process.env.VITEST === 'true'` (`session-utils.ts:22`), so the tests exercise a different runtime than users get                                                                                         |
| 8   | Documented payload key is wrong                                                                       | `docs/src/pages/reference/api.astro:69` says `{ payload: { key: 'Tab' } }`                               | The broker reads `payload?.keys` (`broker-actions.ts:60`) and presses an empty chord. MCP uses a third spelling, `key`                                                                                                                                                                                |
| 9   | Errors print to stdout                                                                                | `packages/cli/src/lib/helpers.ts:89-101`                                                                 | `a1 wcag show 9.9.9 2>/dev/null` still prints the error. Piped output is ambiguous                                                                                                                                                                                                                    |
| 10  | `doctor --json` is the only JSON output not wrapped in the envelope                                   | `packages/cli/src/program.ts:26-30`                                                                      | Top-level keys are `ready, host, ...` with no `ok`/`result`. The index page promises "every subcommand prints one structured object"                                                                                                                                                                  |
| 11  | `fetch()` for `inspect`, `axe`, and `sr start --url` has no timeout                                   | `packages/core/src/targets/runtime.ts:54`                                                                | A hanging server hangs the CLI forever. `axe` additionally fetches the HTML and then discards it before Playwright loads the page again                                                                                                                                                               |
| 12  | Target-busy check is read-then-act with no lock                                                       | `packages/core/src/driver/runtime.ts:130-155`                                                            | Two concurrent `sr start --target voiceover` both pass                                                                                                                                                                                                                                                |
| 13  | Sockets hard-coded to `/tmp`; `.a11ied/state/broker` is created and never used                        | `session-utils.ts:18,45`                                                                                 | Ignores `TMPDIR`; dead directory                                                                                                                                                                                                                                                                      |
| 14  | `--version` means the WCAG version on subcommands and the CLI version at the root                     | every `wcag`, `inspect`, `axe` subcommand                                                                | `a1 --version` and `a1 wcag show 1.1.1 --version 2.1` are unrelated flags with one name                                                                                                                                                                                                               |
| 15  | Broker request framing is "buffer contains a newline"                                                 | `driver/broker-server.ts:48`                                                                             | Pipelined requests on one connection corrupt                                                                                                                                                                                                                                                          |
| 16  | No real-target test runs anywhere                                                                     | `.github/workflows/ci.yml` (ubuntu only), no test starts `voiceover` or `nvda`                           | The VoiceOver adapter, focus code, AppleScript path, and recording path are covered only by a manual checklist line                                                                                                                                                                                   |

## Part 2. Command-by-command findings

### `wcag`

What works: pinned data with sha256 provenance, id-or-slug lookup, ranked search over
titles, summaries, techniques, failures, and tags, and the coverage and strategy
objects. The search quality is good (`a1 wcag search focus` returns the right ten).

What is missing for "browse without web fetches" and "understand how to fix":

- `wcag show` prints the summary and the normative text, which for most criteria are
  the same sentence twice, then a URL. It does not print the techniques, advisory
  techniques, or failures that are already in `criteria.2.2.json` for that criterion,
  even though `search` matches on them.
- The data has technique and failure ids and titles (`G100`, `F13`) but no technique
  body text and no technique URL, and no Understanding prose. "How do I fix 1.4.3"
  still requires opening `understandingUrl`.
- Four generated artifacts (`technique-index`, `failure-index`, `tag-index`,
  `slug-index`, plus `coverage-summary`) are built, validated, and released but never
  read at runtime (`wcag-engine/src/artifacts/runtime.ts:101-131`).
- There is no reverse lookup from an axe rule id to a criterion. `wcag search
button-name` happens to rank 4.1.2 first through the failure text, by luck.
- `wcag levels` prints `A, AA, AAA`. It is the most prominent subcommand and the least
  useful.
- `wcag` with no arguments prints help and exits 1.

### `inspect`

`inspect applicable --url https://example.com` reports 0 applicable and 43 likely
applicable criteria, including all eight 1.2.x media criteria, for a page with one
heading and two paragraphs. Every one of the 43 carries the same reason: "Detected
heading signals (heading structure) and matching criterion tags (content)". The
`likely-applicable` state is produced by matching signal categories to criterion
tags, and the `content` tag is on almost every criterion, so the heuristic degrades to
"the page has a heading, therefore everything applies". The 15 regex detectors also
fire on body copy (`/\b(drag|drop)\b/` on "drop us a line"). It runs on fetched HTML
through jsdom with no script execution, so a Vue or React app yields nothing, and
unlike `axe` there is no low-content warning.

The XPath elements added this week are the useful part. The state names
`applicable`, `likely-applicable`, `unknown` are defined nowhere in the CLI output,
and no output suggests a next command.

### `axe`

What works: the system-browser-first launch policy, rule selection from the pinned
coverage data, the new text renderer with failing nodes and fix bullets.

What is missing for the audit and CI use cases:

- Exit code is always 0 (defect 1). No `--fail-on <impact>`, no baseline file.
- `http`/`https` only. No `file://`, no HTML on stdin, no `--html`, so an agent
  editing a local component with no dev server has no target.
- No `--selector` scope, no `--wait-for`, no pre-scan interaction, no cookies or
  headers, no viewport, no multiple URLs, no SARIF or JUnit output.
- The result carries raw axe tags, not resolved criterion ids, and never suggests
  `a1 wcag show <id>`.

### `sr`

What works: the broker session model, the envelope, target resolution with the
`--allow-virtual` safety, the command registry with three command sets, `help-all`
listing every named command, focus by app or bundle id, recording to `.mov`/`.mp4`.
The state snapshot (`lastSpokenPhrase`, `spokenPhraseLog`, `itemTextLog`,
`currentItemText`) is uniform across targets and is the right primitive.

What is missing or wrong:

- `previous`, `interact`, `stop-interacting`, and `activate` are not subcommands;
  only `next` is. They exist only through `sr do`, which the virtual target rejects
  (defect 3).
- Only `press`, `type`, and `do` auto-start a session; `next`, `read`, `logs`,
  `checkpoint`, and `focus` throw `missing-session`. The auto-started session has no
  URL and no app, so the first key goes to whatever window is focused.
- The virtual target is `@guidepup/virtual-screen-reader` over jsdom with no
  `runScripts`. No page JavaScript runs. Nothing in the docs says this, and the
  `targets` page calls virtual "usable in CI".
- Recording captures video only. The phrase log lives in memory and is discarded on
  `sr stop`. There is no transcript file, so the recording cannot be correlated with
  what was spoken.
- `checkpoint` stores `{label, createdAt}` and nothing reads it back as a range.
- No batch or script mode. A 20-step flow is 20 process launches, each of which runs
  the stale-session sweep.
- Three names for one concept: CLI `sr`, source files `drive-*.ts`, MCP
  `driver_session`/`driver_action`. Also `press` sends action `key` with payload
  `keys`.
- All timeouts are constants (`broker-client.ts:12-19`, `adapters.ts`); none is
  configurable.

### `doctor` and `setup`

These are now in good shape and are the only commands with a check that fails CI
(`doctor --strict`). Keep them as the model for the rest.

### `mcp`

Eight tools, seven resources, structured JSON responses. Drift from the CLI:
`wcag_levels` is CLI `wcag criteria --level`; `run_axe` requires a selector where the
CLI defaults to all rules; `include` filtering exists only in MCP; the `key` payload
spelling differs. Missing: `sr list` equivalent (agents guess command names from
prose), axe rule lookup, techniques, any assertion helper, any accessibility tree or
screenshot, and any target that is not a public URL.

### Agent skill

`packages/skills/a11ied/SKILL.md` has eleven workflow steps and ten rules and not
one command example, while rule 10 says "Keep command examples copy-pasteable".
It never names `wcag show`, `inspect`, or `axe`. No session recipe, no assertion
pattern, no cleanup rule, no `resources/` directory.

### TypeScript library

The `a11ied` package re-exports 35 functions from `@a11ied/core`. All of them are the
CLI's own plumbing. There is no test-facing API: no `withScreenReader()`, no
disposable session, no matchers, no `goTo`, no `readAll`, no `waitFor`.
`runDriverSessionAction(id, 'key')` typechecks with no payload. `startDriverSession`
takes `(target, cwd, recordingPath)` positionally. `api.astro` warns that "a session
outlives the code that started it", which is a description of the missing helper.

### Docs site

The IA is clean and the writing is good. The gaps are pages that do not exist: write
tests, run in CI, understand a violation, script the CLI and read exit codes,
troubleshoot. Every sample output is a hand-typed transcript (`macOS 26.0`,
`Node v24.19.0`, the nine-entry phrase log copied into three pages) and every number
(72 AA rules, 86/28/10/48) is unasserted. `docs-release.test.ts` and
`docs-ux.test.ts` check that strings exist, not that they are true. Quickstart step 4
describes `sr read` and runs `sr logs`.

## Part 3. What "magical" would mean here

The stated use cases collapse into one loop a developer or agent runs against the thing
they are building:

1. Point a11ied at it (a localhost URL, a file, a component, a native app).
2. Get back what a screen reader user would experience, and what fails.
3. Turn any of that into an assertion that fails the build.
4. Look up why it matters and how to fix it, without leaving the terminal.

Four abstractions make that loop feel effortless. Each is a layer on the existing
foundations.

### 3.1 A target, not a URL

Every command that touches a page should accept one positional `<target>`:
`http(s)://...`, a local path, `-` for HTML on stdin, `--html '<button/>'`, or
`app:Safari` for a native app. Resolve it once in `resolveDocumentTarget` and have
`axe`, `inspect`, `sr start`, and the new commands below share it. This is what lets an
agent test the component it just edited with no dev server, and what makes `a1 axe
src/components/Dialog.html` a one-liner.

### 3.2 The transcript as the primary artifact

What a screen reader said is the product. Make it a file, not a memory:

- One active session at a time, always. `sr start` replaces any previous session
  after stopping it, every other `sr` command uses the active one, and no command
  takes or prints a session id. Decided 2026-09-04. The `--session` flag,
  `$A11IED_DRIVE_SESSION`, and the per-cwd `current-drive-session` file all go.
- The transcript is available on demand and on stop: `sr transcript` prints it, and
  `--out <path>` on `sr transcript` or `sr stop` writes it as JSON (`.json`) or
  Markdown (`.md`), chosen by extension or `--format`. Phrases, item text,
  timestamps, checkpoints, target, and URL are included, and a recording, when
  present, gets the transcript written next to it. Decided 2026-09-04.
- `sr walk <target>` reads a page top to bottom with a bounded step count and prints
  the transcript. This is the single most useful command for "audit an existing
  component" and it needs nothing new underneath: it is `start`, N times `next`,
  `logs`, `stop`.
- `sr goto --role button --name Pay` moves until the spoken phrase matches, with a
  bound, and fails with exit 4 if it never does.
- `sr expect "button, Pay"` (or `--match /regex/`) asserts against the last phrase or
  the log since a checkpoint, exit 4 on mismatch. `checkpoint` then has a purpose:
  `sr expect --since form-opened "required"`.
- `sr batch` reads one action per line (JSON lines on stdin) and runs them in one
  process. Agents and shell scripts stop paying a process launch per step.

### 3.3 Verdicts with exit codes

`cliExitCodes.assertion = 4` is already defined. Use it:

- `axe` exits 4 on violations, with `--fail-on serious` and `--baseline file.json`
  to accept known findings, and `--format sarif` for GitHub code scanning.
- `sr expect`, `sr goto`, and `sr walk --expect` exit 4.
- `a1 audit <target>` runs the whole loop once: axe, accessibility tree summary,
  virtual walk transcript, criterion rollup, and the next commands to run. Exit 4 if
  anything failed. This is the command a rule or skill tells an agent to run after
  every change, the way it would run Playwright today.

The accessibility tree deserves its own command. Playwright's `ariaSnapshot()` gives a
YAML tree of roles and names from the real browser, which is what a screen reader will
see, and it needs no heuristics. `a1 tree <target> [--role button]` replaces most of
what `inspect` tries to infer from regexes, and it works on JavaScript-rendered pages.

### 3.4 A test API that owns the lifecycle

Ship two entry points from the `a11ied` package:

- `a11ied/test`: runner-agnostic.
  `await using sr = await screenReader({ target: 'virtual', url })` with `next()`,
  `previous()`, `press()`, `type()`, `readAll()`, `goTo({ role, name })`,
  `transcript()`, `expectSpoken(/.../)`, and `Symbol.asyncDispose` so cleanup is
  automatic. Explicit `mode: 'in-process' | 'broker'` replaces the `VITEST` sniff.
- `a11ied/vitest`: `expect.extend` matchers `toHaveSpoken`, `toHaveSpokenInOrder`,
  `toBeOn({ role, name })`, and a `test.extend` fixture that provides `sr`.

The virtual target should run inside the Playwright page rather than jsdom when a
browser is available (Chromium is already required for `axe`). Guidepup's virtual
screen reader is a browser library; injecting it with `addScriptTag` gives the virtual
target JavaScript-rendered pages, live regions, and focus management for free, and
leaves jsdom as the fallback for `--html` input only. For Vitest browser mode, where
the component is already mounted in a real browser, expose the same API directly with
no broker at all. That is the "write accessibility tests the way Vitest lets you write
browser tests" story, and it is the shortest path to it.

### 3.5 WCAG knowledge that answers "why" and "how"

- `a1 wcag 1.4.3` with no subcommand shows the criterion. `a1 wcag` with no
  arguments opens the interactive finder: fuzzy search over criteria, techniques, and
  failures, with a detail pane and keys for techniques, failures, coverage, and copying
  the `axe --criterion` command. Built with `ink` (MIT), two panes: results on the
  left, detail on the right. Decided 2026-09-04.
- Ship Understanding prose and technique bodies in the pinned data. The W3C `wcag`
  repository has both as HTML under the W3C Document License, which permits
  reproduction with attribution; confirm that before syncing, then convert to text at
  sync time. This is what makes "no web fetch" true.
- `a1 wcag techniques 1.4.3`, `a1 wcag failures 1.4.3`, `a1 wcag technique G18`.
- `a1 wcag rule color-contrast` maps an axe rule to its criteria, the fix text, and the
  techniques. `axe` output links each violation to it.
- Fold `wcag coverage` into `wcag show` output and delete `wcag levels`.

## Part 4. What to remove or rename

- Remove `inspect` as a top-level command. Keep the signal detectors and XPaths as the
  "applicability" section of `a1 audit` and as the `--applicable` filter on `wcag
criteria <target>`, but show only signal-backed `applicable` states by default. The
  tag-based `likely-applicable` state is noise and should go.
- Remove `wcag levels`, `click-current-item` (duplicate of `activate`), and the five
  unused generated index files, or wire the indexes in.
- Rename `--version` on subcommands to `--wcag <2.1|2.2>`.
- Pick `sr` everywhere: rename `drive-*.ts` files, the `driver_*` MCP tools to
  `sr_session` and `sr_action`, and the `key`/`keys`/`press` trio to one name.
- Move session state to a per-user directory (`~/.a11ied/state` or
  `$XDG_STATE_HOME/a11ied`) holding the one active session, with a lock file and a
  broker idle timeout. `sr sessions` and `sr stop --all` become unnecessary once
  only one session exists; `sr stop` always stops it. Per-cwd state was the cause of
  defect 4 and guarantees more orphaned VoiceOver sessions.
- Generate the MCP tool set from the CLI command registry so the two cannot drift.
- Keep `help-all`; it is the only place the full command list appears. Consider
  `a1 --help --all` as an alias.

## Part 5. `sr` in depth

Added 2026-09-04 after the decisions above (one active session, transcript files, ink).
Measured against two questions: can a developer or agent script the common tasks, and
can they play out the workflows a screen reader power user actually performs?

### 6.1 What a power user does that `sr` cannot express

VoiceOver and NVDA users do not read pages one item at a time. They jump by structure
and they ask what they are on. The table lists the workflow, the keys a user presses,
what Guidepup already exposes, and what `sr` offers today.

| Workflow                                                                   | VoiceOver                      | NVDA             | Guidepup has                                                                                     | `sr` today                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Jump by heading                                                            | VO-Cmd-H, rotor                | H / Shift-H, 1-6 | `voiceOver.nextHeading()`, NVDA key commands, `virtual.commands.moveToNextHeading` and per-level | `sr do find-next-heading` on VoiceOver only; nothing on virtual or NVDA; no level filter                                   |
| Jump by landmark, link, form control, table, list, graphic                 | rotor, VO-Cmd-L/J/T/X/G        | D, K, F, T, L, G | `nextLink`, `nextLandmark`, per-landmark virtual commands, NVDA keys                             | `sr do` on VoiceOver only                                                                                                  |
| Rotor or elements list (list every heading, link, landmark, then pick one) | VO-U                           | NVDA-F7          | nothing direct; derivable by walking                                                             | nothing                                                                                                                    |
| Read all from here                                                         | VO-A                           | NVDA-Down        | `perform` of the key command                                                                     | `sr do read-all-text` on VoiceOver only                                                                                    |
| What am I on (role, name, value, state)                                    | VO-F3, caption panel           | NVDA-Tab         | `itemText`, `lastSpokenPhrase`; `virtual.activeNode`; macOS AX query                             | `sr read` prints the last phrase and item text; `axFocusedElement` (keyboard focus, not the VO cursor) is in the JSON only |
| Go to top or bottom                                                        | VO-Shift-Home / End, Fn-arrows | Ctrl-Home / End  | key commands                                                                                     | `sr do move-to-area-top` on VoiceOver only                                                                                 |
| Interact with a group or table, read row and column headers                | VO-Shift-Down, VO-R, VO-C      | Ctrl-Alt-arrows  | `interact`, key commands                                                                         | `sr do interact` on real targets; no table commands on virtual                                                             |
| Find text on the page                                                      | VO-F                           | NVDA-Ctrl-F      | key commands                                                                                     | `sr do find` then `sr type` on VoiceOver, untested                                                                         |
| Read the page title or window summary                                      | VO-F2                          | NVDA-T           | key commands                                                                                     | `sr do hear-window-summary` on VoiceOver only                                                                              |
| Repeat the last phrase, copy it                                            | VO-Z, VO-Shift-C               | NVDA-Shift-...   | `copyLastSpokenPhrase`, `saveLastSpokenPhrase`                                                   | `sr read`                                                                                                                  |
| Screenshot what the cursor is on                                           | caption panel                  |                  | `takeCursorScreenshot`, `capture`                                                                | nothing                                                                                                                    |

The pattern: everything above works on VoiceOver through `sr do`, most of it through a
command name the user has to discover in a 400-line list, and none of it works on the
virtual target that CI and most first runs will use. The "portable" set that does work
everywhere is six commands: `next`, `previous`, `interact`, `stop-interacting`,
`activate`, and its duplicate `click-current-item`.

### 6.2 What a script or agent cannot do

Concrete tasks from the stated use cases, and the primitive each one is missing.

- **Walk the page and give me the transcript.** Needs a bounded loop with an end
  detector. Today: a shell loop over `sr next --json` with a hand-written cap and no
  way to know the end was reached.
- **Tab through every focusable and report what each one announces.** Needs
  `press Tab` repeated with an end detector. `sr press` accepts one chord per call, so
  a sequence is N process launches, and the help text "one or more key chords" is
  wrong: `normalizeDriverKeys` splits on `+` and sends a single chord.
- **Open the dialog, assert its name was announced, press Escape, assert focus went
  back.** Needs `expect`, `wait`, and a way to read the log since a point. `checkpoint`
  records a label and nothing reads a range from it. `logs` has no `--since`, no
  `--tail`, and the `logCursor` it prints is used by nothing.
- **Fill the form, submit, assert the error was announced.** Needs `wait --for` with
  a timeout, because live-region announcements arrive after the action returns. Nothing
  waits for a phrase; speech stabilization waits only for silence.
- **Navigate to a new URL in the same session.** The `attach-document` action exists
  in the broker and there is no `sr open`. Real targets have no way at all to move on.
- **Recover from a bad state.** No `sr top`, no `sr escape`, no `sr restart`.
- **Time-box anything.** No `--timeout` on any command; the constants in
  `broker-client.ts` and `adapters.ts` are fixed.
- **Print just the phrase.** Shell scripts want `sr next --phrase` to print one line;
  today they parse the envelope with `jq`.

<!-- vale off -->

### 6.3 Clarity problems in the current surface

<!-- vale on -->

- `sr status` and `sr read` print the same block. `status` should be session
  metadata: target, URL, uptime, recording, transcript length. `read` should be the
  current item.
- `sr start` output leads with the session id, broker PID, and socket path. With one
  session those are implementation details for `--verbose`.
- `--session`, `--target`, `--allow-virtual`, and `--ephemeral` are on every action
  command. `--ephemeral` on `read`, `logs`, and `checkpoint` reads a fresh empty
  session. `--target` on an action invites a target that does not match the running
  session. With one active session, `start` is the only command that needs a target.
- Only `next` is a subcommand; `previous`, `interact`, `stop-interacting`, and
  `activate` are reachable only through `do`, which virtual rejects.
- `sr list` prints 402 lines on macOS with no grouping beyond command set. The
  `--query` filter is the only way to use it and the help does not lead with it.
- `sr do` conflates VoiceOver commander phrases, VoiceOver key-code names, and the
  portable six. Namespacing (`voiceover-keycode:move-to-next`) exists in the resolver
  and is documented nowhere.
- `press` maps to action `key` with payload `keys`; the API docs say `key`; MCP says
  `key`. One name.
- The state snapshot has no semantic "what am I on". VoiceOver gives `itemText` and the
  phrase; the AX query reads keyboard focus, which is not the VoiceOver cursor. Virtual
  has `activeNode` and nothing reads its role or name. NVDA has neither.
- NVDA has only a key-code command set. There is no NVDA equivalent of the commander
  phrases, so `sr do` on NVDA is `sr press` with a lookup table.

<!-- vale off -->

### 6.4 Proposed `sr` surface

<!-- vale on -->

One active session. No ids. Target-independent verbs first, target-specific escape
hatches second. Every navigation verb prints the phrase it produced and, when known,
the item it landed on.

```txt
a1 sr start [<target>] [--sr voiceover|nvda|virtual] [--record <path>]
a1 sr open <target>                       navigate the running session
a1 sr stop [--out <transcript.json|.md>]
a1 sr status                              target, url, uptime, recording, counts

a1 sr read                                current item: role, name, value, states, phrase
a1 sr next|previous [<kind>] [--level N] [--times N]
                                          kind: item (default), heading, link, landmark,
                                          control, button, table, list, graphic,
                                          region, form-field
a1 sr top | bottom
a1 sr interact | stop-interacting | activate | escape
a1 sr press <chord> [<chord>...]          a sequence, one chord per argument
a1 sr type <text>
a1 sr read-all [--max N]                  say-all as a transcript, bounded
a1 sr walk [<target>] [--max N] [--out <path>]
                                          start (if needed), read-all, print transcript
a1 sr elements <kind>                     the rotor: every heading, link, landmark, or
                                          control as the reader announces it
a1 sr goto --role <role> --name <text> [--max N]
a1 sr wait [--for <text|/regex/>] [--ms N] [--timeout N]
a1 sr expect <text|/regex/> [--since <checkpoint>] [--not]   exit 4 on mismatch
a1 sr checkpoint <label>
a1 sr transcript [--since <checkpoint>] [--tail N] [--out <path>] [--format json|md]
a1 sr focus [--app <name>] ...            default: the app this session opened
a1 sr screenshot <path>                   VoiceOver cursor capture where supported
a1 sr do <command> | a1 sr list [--query] target-specific named commands, unchanged
a1 sr batch [<file>]                      JSON lines of actions, one process
```

Implementation notes that keep this honest:

- `next <kind>` is one portable table with three columns: VoiceOver (Guidepup
  `nextHeading`, `nextLink`, `nextLandmark`, or a commander phrase), NVDA (the key
  from `NVDAKeyCodeCommands`), and virtual (`virtual.commands.moveToNext*`). Every kind
  in the list above has an entry in all three columns today.
- `read` gets role and name from `virtual.activeNode` on virtual, from the VoiceOver
  phrase and `itemText` on VoiceOver (the phrase format is `name, role` and is
  parseable for the common roles), and from `itemText` on NVDA. Label the source.
- `elements <kind>` is `top`, then `next <kind>` until the phrase repeats, on every
  target. It is the virtual target's answer to the rotor and the only way an agent can
  see the page the way a power user does.
- `walk` and `read-all` stop when the phrase repeats or `--max` is hit, and say which.
- `wait --for` polls the log, not the last phrase, so an announcement that arrives
  between two commands is not lost.
- `--phrase` on any navigation verb prints one line for shell loops. `--json` stays.
- `batch` reuses the broker connection for the whole file and stops at the first
  failed `expect` unless `--continue`.
- Remove `--session`, `--ephemeral` from read-only verbs, `--target` and
  `--allow-virtual` from everything but `start`, `click-current-item`, and `clear-logs`
  (a checkpoint plus `--since` covers it). Rename `logs` to `transcript`.

## Part 6. Sequencing

Ordered so each step is independently shippable and the dependable base comes first.
Every item is tracked as a bead under the epics created 2026-09-04.

1. Bullet-proofing (defects 1 to 15): exit 4 for `axe`, errors to stderr, envelope
   for `doctor`, fetch timeout, one active session in per-user state with a lock file
   and a broker idle timeout, the recording fix, the payload key fix, one speech set,
   `--wcag`.
   Add a macOS GitHub Actions job that runs one VoiceOver smoke test through
   `guidepup/setup-action`, and a Windows job for NVDA, so defect 16 stops being true.
2. Knowledge completeness: techniques and failures in `wcag show`, Understanding and
   technique text in the data, `wcag rule`, `wcag <id>` shorthand, coverage folded in.
3. The `sr` command set from Part 5: portable `next <kind>`, first-class portable verbs,
   `read` with role and name, `transcript` files, `elements`, `walk`, `goto`, `wait`,
   `expect`, `open`, `batch`. Then the target abstraction and `a1 tree`.
4. `a1 audit` and the skill rewrite with copy-pasteable recipes for the dev loop.
5. `a11ied/test` and `a11ied/vitest`, virtual target inside the Playwright page,
   Vitest browser mode entry point. Docs pages: write tests, CI, understand a
   violation, scripting and exit codes, troubleshooting. Generate sample outputs from
   real runs and assert the numbers.
6. The `wcag` interactive finder.

Steps 1 and 2 are small and remove most of the reasons a developer would stop trusting
the tool. Steps 3 to 5 are where the product becomes the thing described in the
purpose statement.
