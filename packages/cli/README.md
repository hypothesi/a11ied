# a11ied

`a11ied` is a CLI-first accessibility automation toolkit. It ships the `a1` (also `a11ied`) command and a programmatic API for WCAG lookup, axe-core scanning, screen reader control, and runtime diagnostics.

## install

```sh
npm install a11ied
```

After installing, run `a1 doctor` to see which browser and screen reader targets are ready and which setup steps are still missing. `a1 setup` runs the Guidepup steps for real VoiceOver or NVDA sessions.

## CLI

```sh
a1 doctor                          # check this machine, list missing setup steps
a1 doctor --strict                 # same, exit 3 while a required step is missing
a1 setup                           # run the Guidepup setup steps, then re-check
a1 wcag                            # interactive WCAG finder (terminal only)
a1 wcag 4.1.3 --json               # look up a criterion with techniques, failures, and test method
a1 wcag rule color-contrast        # map an axe rule to its criteria and fixes
a1 axe <url> --json                # run axe-core scan against a URL, file, - for stdin, or --html
a1 tree <url> --json               # print the accessibility tree for a target
a1 audit <url> --json              # run axe, tree, and the relevant criteria scan together
a1 sr start <url> --json           # start the screen reader session on a page
a1 sr next --json                  # move to the next item
a1 sr read --json                  # read the current item
a1 sr transcript --json            # print what the reader said, with timestamps
a1 sr stop --json                  # end the session
a1 mcp                             # start the MCP server
a1 help-all                        # print full command tree
```

See `a1 --help` or `a1 help-all` for the full command reference.

## programmatic API

```ts
import { listWcagCriteria, runAxe, startDriverSession, createDoctorReport } from 'a11ied';
```

## targets

The CLI and API support three target types:

- `voiceover`: real VoiceOver (macOS only)
- `nvda`: real NVDA (Windows only)
- `virtual`: headless virtual screen reader backed by `@guidepup/virtual-screen-reader`

Pass `--sr virtual` for fast, deterministic local runs.

One session is active per user. `sr start` stops any session already running, and no
other command takes a session id. The session state file is `~/.a11ied/state/session.json`,
or the same file under `$XDG_STATE_HOME/a11ied` or `$A11IED_STATE_DIR` when either is set.
