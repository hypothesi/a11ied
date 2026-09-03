# a11ied CLI low-level guide

This is the current shipped CLI surface.

Top-level commands:

- `wcag`: local WCAG lookup, search, and coverage data
- `inspect`: explain which criteria look relevant for a page
- `sr`: low-level screen reader control through a stable session
- `doctor`: show runtime support, browser policy, and recording diagnostics
- `axe`: run `axe-core`
- `mcp`: expose the same core capabilities over MCP stdio

Start here:

```sh
node packages/cli/dist/cli.js --help
node packages/cli/dist/cli.js help-all
node packages/cli/dist/cli.js doctor
node packages/cli/dist/cli.js doctor --json
npx playwright install chromium
```

Browser-backed commands prefer an installed local Chrome, Edge, Brave, or Chromium browser.
If none is available, install Playwright Chromium with `npx playwright install chromium`.

## WCAG lookup

```sh
node packages/cli/dist/cli.js wcag levels --json
node packages/cli/dist/cli.js wcag criteria --level AA --json
node packages/cli/dist/cli.js wcag show 4.1.3 --json
node packages/cli/dist/cli.js wcag show accessible-authentication --json
node packages/cli/dist/cli.js wcag search "status messages" --json
node packages/cli/dist/cli.js wcag coverage 4.1.3 --json
```

## Local fixture server

Serve the HTML fixtures in this repo:

```sh
python3 -m http.server 6173 --bind 127.0.0.1 --directory /Users/mluedke/code/personal/a11ied/packages/cli/test/fixtures
```

## Inspect

```sh
node packages/cli/dist/cli.js inspect applicable --url http://127.0.0.1:6173/basic-page.html --json
node packages/cli/dist/cli.js inspect criterion 4.1.3 --url http://127.0.0.1:6173/status-message.html --json
```

## sr

Start a session, keep the `sessionId`, then drive it:

```sh
node packages/cli/dist/cli.js sr start --target virtual --allow-virtual --url http://127.0.0.1:6173/basic-page.html --json
node packages/cli/dist/cli.js sr status --session <sessionId> --json
node packages/cli/dist/cli.js sr do next --session <sessionId> --json
node packages/cli/dist/cli.js sr do previous --session <sessionId> --json
node packages/cli/dist/cli.js sr press Tab --session <sessionId> --json
node packages/cli/dist/cli.js sr type "hello world" --session <sessionId> --json
node packages/cli/dist/cli.js sr list --target voiceover --command-set voiceover-commander
node packages/cli/dist/cli.js sr do move-right --session <sessionId> --json
node packages/cli/dist/cli.js sr do move-to-area-bottom --session <sessionId> --json
node packages/cli/dist/cli.js sr read --session <sessionId> --json
node packages/cli/dist/cli.js sr logs --session <sessionId> --json
node packages/cli/dist/cli.js sr checkpoint smoke-1 --session <sessionId> --json
node packages/cli/dist/cli.js sr stop --session <sessionId> --json
```

Real targets:

```sh
node packages/cli/dist/cli.js sr start --target voiceover --url http://127.0.0.1:6173/basic-page.html --json
node packages/cli/dist/cli.js sr start --target nvda --url http://127.0.0.1:6173/basic-page.html --json
```

Named command sets:

- `portable`: stable aliases such as `next`, `previous`, `interact`, and `activate`
- `voiceover-commander`: Guidepup VoiceOver Commander commands, used by default for VoiceOver
- `voiceover-keycode`: Guidepup VoiceOver keyboard command objects
- `nvda-keycode`: Guidepup NVDA keyboard command objects, used by default for NVDA

Use `sr list` for the complete list. `help-all` also includes the complete list.
Invalid target and command-set combinations fail before any screen reader command runs.

## axe

```sh
node packages/cli/dist/cli.js axe --url http://127.0.0.1:6173/basic-page.html --json
node packages/cli/dist/cli.js axe --url http://127.0.0.1:6173/contrast-failure.html --level AA --json
node packages/cli/dist/cli.js axe --url http://127.0.0.1:6173/button-name-failure.html --criterion 4.1.2 --json
node packages/cli/dist/cli.js axe --url http://127.0.0.1:6173/basic-page.html --rule button-name color-contrast --json
```

## MCP

```sh
node packages/cli/dist/cli.js mcp
```

The MCP server exposes 8 tools:

| Tool             | Purpose                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| `doctor`         | Runtime environment details                                                    |
| `wcag_lookup`    | Look up a criterion (optionally with coverage data)                            |
| `wcag_search`    | Search criteria by keyword                                                     |
| `wcag_levels`    | List criteria at a conformance level                                           |
| `inspect`        | Inspect applicable criteria for a URL (optionally for one criterion)           |
| `driver_session` | Start, query status, or stop an accessibility-driver session                   |
| `driver_action`  | Run a single action (next, previous, read, key, etc.) against a driver session |
| `run_axe`        | Run axe-core against a target                                                  |

### Real vs simulated screen readers

On macOS the default target is **VoiceOver** (real). On Windows it is **NVDA** (real).
If neither is available the target falls back to `virtual`, which is a **simulation** - it
models screen reader behavior in memory but does not test real assistive technology.
On macOS and Windows, `virtual` is allowed only when you opt in with `--allow-virtual`
(CLI) or `allowVirtual=true` (MCP).

Every `driver_session` start response includes a `targetType` field (`"real"` or `"simulated"`)
so agents always know the fidelity of their results.

For **real** screen reader sessions the agent must open a browser and navigate to the page
_before_ starting the session. The screen reader reads whatever browser window is focused.
For **virtual** sessions, pass `url` and a11ied injects HTML automatically.

## Practical note

Use `--json` most of the time. The text output is fine for a quick read, but the JSON is the stable machine-facing interface.
