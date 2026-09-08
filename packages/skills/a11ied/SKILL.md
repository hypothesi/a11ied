---
name: a11ied
description: Use when you need to plan, script, or execute accessibility checks with the a11ied CLI or MCP server. Run the dev loop after a component change, use axe for the automated checks, and use the screen reader for behavior axe cannot see. Keep automated results, screen reader transcripts, and manual judgment separate.
---

# a11ied

Use this skill when the task is specifically about the `a11ied` toolchain: the `a1` CLI,
the `@a11ied/mcp-server` MCP server, or the `a11ied` TypeScript package.

`a1 help-all` prints every command and option this skill refers to. Run it once at the
start of a session if a command below looks unfamiliar.

## The dev loop

Run this after changing a component or page, the way you would run a test suite.

```txt
a1 doctor --strict
a1 audit http://localhost:3000/the/route/you/changed
```

`doctor --strict` exits 3 when a required setup step is missing (a browser, a screen
reader target). Fix that first. Every other command depends on it.

`audit <target>` runs axe against every mapped rule, prints an accessibility tree
summary, lists the relevant criteria, and rolls the result up by criterion. It exits 4 when
an axe violation was found. Read the `nextCommands` field in its output: it lists the
exact `a1 wcag rule <id>` and `a1 sr walk <target>` commands to run next.

Fix what `audit` reported, then rerun the same command. Do not consider the change done
until `audit` exits 0.

`<target>` accepts an http(s) URL, a local file path, `-` for HTML on stdin, or
`--html '<button/>'`. Use a file or `--html` to test a component in isolation with no dev
server running.

## Look up WCAG before testing

If the task is framed in WCAG terms, resolve the criterion or target level before testing:

```txt
a1 wcag 1.4.3
a1 wcag contrast-minimum
a1 search "focus order"
a1 wcag rule color-contrast
```

`a1 wcag <id-or-slug>` prints the normative text, techniques, failures, test method,
and, for a criterion WCAG2Mobile covers, what changes when the target is a mobile app. `a1 search <query>` finds the id when you only have a description, across both the WCAG
data and the ARIA patterns. `a1 wcag
rule <axe-rule-id>` maps an axe violation back to the criteria it covers and axe's fix
text, which is the last command `audit`'s `nextCommands` field names for a violation.

## Look up the ARIA pattern before writing a widget

Before writing or reviewing a custom widget with a role such as combobox, tabs, menu, or
slider, read what the ARIA Authoring Practices Guide says about it instead of recalling it:

```txt
a1 pattern combobox
a1 pattern combobox-select-only
a1 pattern role combobox
a1 pattern attribute aria-expanded
```

`a1 pattern <id>` prints the pattern and the examples the guide publishes for it. Give it an
example id instead and it prints that example's keyboard support table and its role,
property, state, and tabindex table. `a1 pattern role <role>` goes the other way: from a role
you saw in an accessibility tree to the examples that document it.

Then check a real page against one:

```txt
a1 pattern check http://localhost:3000 --pattern combobox-select-only --selector '#fruit'
```

`--selector` is required. It scopes the check to one widget, and there is no default worth
guessing.

Read what the check decides and what it does not. It presses every key the example declares
and reports a key that produced no focus change, no ARIA attribute change, and no
accessibility tree change. That, and an attribute pointing at an id the document does not
have, are the only two findings it exits 4 on. Every other key is printed with what changed
next to the guide's own description of what should have changed, for you to judge. An
attribute the example documents that the widget never sets is listed under "May not apply"
as a hint, not a finding: it usually means the widget is in a different state or is a
different variant of the pattern.

The check presses the keys in the first keyboard table only. An example with more than one
table documents more than one state, such as an open listbox, and the run lists the tables it
skipped. Use `--table` with `--setup` to reach one of them.

## Test methods

Every criterion has a test method, which says how much a tool can decide on its own:

- automated: axe rules decide the criterion (most axe-mapped criteria)
- hybrid: the automated checks run first and a person decides the rest (most screen
  reader checks)
- manual: the tool prints the requirement and the techniques, and a person tests it

Report the test method next to every result. A passing `a1 audit` run decides the
automated criteria only. Do not describe it as full WCAG conformance.

## Screen reader recipe

Use the screen reader for labels, focus order, dialogs, menus, and live-region
announcements. Axe reports none of those in sequence.

```txt
a1 sr start --sr virtual --allow-virtual http://localhost:3000/checkout
a1 sr walk
a1 sr elements heading
a1 sr goto --role button --name "Place order"
a1 sr expect "Place order, button"
a1 sr stop
```

- `sr start --sr virtual --allow-virtual <url>` starts one session and loads the page.
  Only one session is active at a time.
- `sr walk` reads the page top to bottom and prints the transcript, the fastest way to
  see everything the reader would announce.
- `sr elements <kind>` lists every heading, link, landmark, or control of one kind, the
  rotor view.
- `sr goto --role <role> --name <text>` moves the cursor to the first item that matches.
- `sr next [kind]`, `sr previous [kind]`, `sr interact`, `sr activate`, `sr press
<chord>`, and `sr type <text>` operate the page like a person would.
- `sr stop` ends the session and prints its transcript. Always the last command.

## The assertion pattern

`a1 sr expect <text|/regex/>` checks the transcript for a phrase and exits 4 when it did
not appear (or, with `--not`, when it did). `--since <checkpoint>` scopes the check to
phrases after `a1 sr checkpoint <label>`. This is the same exit code `a1 axe` and `a1
audit` use for a failing check, so a script or CI step can treat all three the same way:

```txt
a1 sr checkpoint before-submit
a1 sr activate
a1 sr expect --since before-submit "Order placed"
echo "exit code: $?"
```

Exit 0 means the check passed. Exit 4 means it failed, and the failure reason is in the
command's own output. Nothing else to parse. Exit 3 means the environment is not ready
(run `a1 doctor`).

## Real screen reader vs. virtual

`--sr virtual` runs a simulated reader in a headless browser. It has no real assistive
technology behavior: no VoiceOver speech engine, no NVDA braille output, no OS-level
focus quirks. Use it for fast, deterministic local loops and for CI.

Escalate to `--sr voiceover` (macOS) or `--sr nvda` (Windows) when the task depends on
real assistive technology behavior specifically, such as confirming what VoiceOver's
rotor announces or how NVDA reads a live region. Do not claim virtual output is
equivalent to VoiceOver or NVDA in a report. Label it "simulated."

Starting a real VoiceOver session takes over speech on the machine running it: VoiceOver
speaks every announcement out loud and takes keyboard focus for its own commands until
the session stops. Warn before starting one, and prefer running it on a machine nobody
is using interactively at the time.

## Cleanup

Always stop a session before the task ends: `a1 sr stop`, or `sr_session` with `action:
"stop"` over MCP. A session left open keeps the screen reader under automation and, for
a real target, keeps controlling the machine's speech. `a1 sr status` shows whether one
is still active. `a1 doctor` also flags a stale session under Action items.

## MCP tool names

The MCP server exposes the same operations as the CLI, one tool per command family. Use
the CLI name in the description above to find the tool:

| CLI command                                                                  | MCP tool        |
| ---------------------------------------------------------------------------- | --------------- |
| `a1 wcag show`                                                               | `wcag_show`     |
| `a1 wcag criteria`                                                           | `wcag_criteria` |
| `a1 search`                                                                  | `search`        |
| `a1 wcag rule`                                                               | `wcag_rule`     |
| `a1 axe`                                                                     | `run_axe`       |
| `a1 tree`                                                                    | `tree`          |
| `a1 audit`                                                                   | `audit`         |
| `a1 sr start` / `open` / `stop` / `status`                                   | `sr_session`    |
| every other `a1 sr` action (`next`, `press`, `perform`, `goto`, `wait`, ...) | `sr_action`     |
| `a1 sr list`                                                                 | `sr_list`       |
| `a1 sr expect`                                                               | `sr_expect`     |
| `a1 sr transcript`                                                           | `sr_transcript` |
| `a1 doctor`                                                                  | `doctor`        |

`a1 sr batch` and `a1 sr walk` have no MCP tool. Call `sr_action` once per step instead
of `batch`. Call `sr_session` (`start`), `sr_action` (`read-all`), then `sr_transcript`
instead of `walk`.

`resources/command-cheat-sheet.md` lists every command and tool with its arguments in
one copy-pasteable page.

## Rules

- Do not claim simulated screen reader output is equivalent to VoiceOver or NVDA.
- Do not claim full WCAG compliance from an automated result alone.
- Do not confuse raw driver transcripts with WCAG claims. A transcript is what the
  reader said. A criterion pass or fail is a judgment made from it.
- Do not skip the relevant criteria scan and jump straight from a target to a compliance
  claim. Run `a1 audit` or look up the criterion's test method first.
- Do not leave a screen reader session open. Call `a1 sr stop` before the task ends.
- State the test method (automated, hybrid, manual) next to every claim.
