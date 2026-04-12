# a11ied CLI low-level guide

This is the current shipped CLI surface.

Top-level commands:

- `wcag`: local WCAG lookup, search, and coverage data
- `inspect`: explain which criteria look relevant for a page or Storybook story
- `drive`: low-level screen reader control through a stable session
- `doctor`: show runtime support, browser policy, and recording diagnostics
- `run axe`: run `axe-core`
- `run pattern`: run higher-level interaction probes built on the driver layer
- `verify`: turn collected evidence into explicit WCAG criterion or level verdicts
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

## Drive

Start a session, keep the `sessionId`, then drive it:

```sh
node packages/cli/dist/cli.js drive start --target virtual --url http://127.0.0.1:6173/basic-page.html --json
node packages/cli/dist/cli.js drive status --session <sessionId> --json
node packages/cli/dist/cli.js drive next --session <sessionId> --json
node packages/cli/dist/cli.js drive previous --session <sessionId> --json
node packages/cli/dist/cli.js drive key --session <sessionId> --keys Tab --json
node packages/cli/dist/cli.js drive type --session <sessionId> --text "hello world" --json
node packages/cli/dist/cli.js drive read --session <sessionId> --json
node packages/cli/dist/cli.js drive logs --session <sessionId> --json
node packages/cli/dist/cli.js drive checkpoint --session <sessionId> --label smoke-1 --json
node packages/cli/dist/cli.js drive stop --session <sessionId> --json
```

Real targets:

```sh
node packages/cli/dist/cli.js drive start --target voiceover --url http://127.0.0.1:6173/basic-page.html --json
node packages/cli/dist/cli.js drive start --target nvda --url http://127.0.0.1:6173/basic-page.html --json
```

## run axe

```sh
node packages/cli/dist/cli.js run axe --url http://127.0.0.1:6173/basic-page.html --json
node packages/cli/dist/cli.js run axe --url http://127.0.0.1:6173/contrast-failure.html --level AA --json
node packages/cli/dist/cli.js run axe --url http://127.0.0.1:6173/button-name-failure.html --criterion 4.1.2 --json
node packages/cli/dist/cli.js run axe --url http://127.0.0.1:6173/basic-page.html --rule button-name color-contrast --json
```

## run pattern

Current built-in pattern ids:

- `tab_sequence`
- `landmark_sequence`
- `heading_sequence`
- `form_field_walk`
- `status_message_probe`
- `dialog_probe`
- `focus_order_probe`
- `focus_visibility_probe`
- `focus_obscured_probe`
- `auth_flow_probe`
- `redundant_entry_probe`

Examples:

```sh
node packages/cli/dist/cli.js run pattern landmark_sequence --target virtual --url http://127.0.0.1:6173/basic-page.html --json
node packages/cli/dist/cli.js run pattern status_message_probe --target virtual --url http://127.0.0.1:6173/status-message.html --json
node packages/cli/dist/cli.js run pattern dialog_probe --target virtual --url http://127.0.0.1:6173/dialog.html --json
node packages/cli/dist/cli.js run pattern focus_obscured_probe --target virtual --url http://127.0.0.1:6173/focus-obscured.html --json
node packages/cli/dist/cli.js run pattern auth_flow_probe --target virtual --url http://127.0.0.1:6173/auth-login.html --json
```

## verify

```sh
node packages/cli/dist/cli.js verify criterion 4.1.3 --target virtual --url http://127.0.0.1:6173/status-message.html --json
node packages/cli/dist/cli.js verify criterion 3.3.8 --target virtual --url http://127.0.0.1:6173/auth-login.html --json
node packages/cli/dist/cli.js verify level AA --target virtual --url http://127.0.0.1:6173/basic-page.html --json
```

## Storybook fixture server

Serve the Storybook fixture in this repo:

```sh
python3 -m http.server 6006 --bind 127.0.0.1 --directory /Users/mluedke/code/personal/a11ied/packages/storybook/test-fixtures
```

Then run:

```sh
node packages/cli/dist/cli.js inspect applicable --storybook-url http://127.0.0.1:6006 --story-id forms-login--default --json
node packages/cli/dist/cli.js drive start --target virtual --storybook-url http://127.0.0.1:6006 --story-id dialogs-confirm-delete--default --json
node packages/cli/dist/cli.js run axe --storybook-url http://127.0.0.1:6006 --story-id forms-login--default --criterion 4.1.2 --json
node packages/cli/dist/cli.js verify criterion 4.1.3 --target virtual --storybook-url http://127.0.0.1:6006 --story-id status-updates--default --json
```

## MCP

```sh
node packages/cli/dist/cli.js mcp
```

The MCP server exposes 10 tools:

| Tool | Purpose |
|---|---|
| `doctor` | Runtime environment details |
| `wcag_lookup` | Look up a criterion (optionally with coverage data) |
| `wcag_search` | Search criteria by keyword |
| `wcag_levels` | List criteria at a conformance level |
| `inspect` | Inspect applicable criteria for a URL/story (optionally for one criterion) |
| `driver_session` | Start, query status, or stop an accessibility-driver session |
| `driver_action` | Run a single action (next, previous, read, key, etc.) against a driver session |
| `run_axe` | Run axe-core against a target |
| `run_pattern` | Run ARIA interaction patterns against a target |
| `verify` | Verify a single criterion or full conformance level |

### Real vs simulated screen readers

On macOS the default target is **VoiceOver** (real). On Windows it is **NVDA** (real).
If neither is available the target falls back to `virtual`, which is a **simulation** — it
models screen reader behavior in memory but does not test real assistive technology.

Every `driver_session` start response includes a `targetType` field (`"real"` or `"simulated"`)
so agents always know the fidelity of their results.

For **real** screen reader sessions the agent must open a browser and navigate to the page
*before* starting the session. The screen reader reads whatever browser window is focused.
For **virtual** sessions, pass `url`/`storybookUrl`/`storyId` and a11ied injects HTML automatically.

## Practical note

Use `--json` most of the time. The text output is fine for a quick read, but the JSON is the stable machine-facing interface.
