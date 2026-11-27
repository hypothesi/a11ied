# a11ied

## 0.3.0

### Minor Changes

- [`68ddb7a`](https://github.com/hypothesi/a11ied/commit/68ddb7ac19cbcc9b33af06f47e47f6111c559176) - `npx a11ied setup` now offers to install `a1` globally, and to add the a11ied skills and MCP server to the AI coding agents it finds, with a checkbox for each. It also asks before it changes system settings for VoiceOver or NVDA. `--yes` accepts every step.

   The new `a1 update` command installs the latest version, and `a1`, `a1 --help`, `a1 doctor`, and the audit dashboard show a short notice when one is available. Set `NO_UPDATE_NOTIFIER` to turn the notice off.

### Patch Changes

- [`c87481d`](https://github.com/hypothesi/a11ied/commit/c87481df8bb1de5a585114c12810a35cf7633c42) - `a1 --version`, the `version` field of `--json` output, the version in `a1 doctor`, and the version the MCP server reports now match the installed version. They reported 0.1.0 in every release.

- [`45fd1e1`](https://github.com/hypothesi/a11ied/commit/45fd1e1b1f68844b60e19907646cc4181365346e) - `a1` commands start about three times faster. `a1 sr next` and the other session commands went from about 0.6 seconds to 0.2 seconds, because the CLI now loads Playwright, jsdom, axe-core, and pngjs only when a command uses them.

## 0.2.0

### Minor Changes

- [`d94a31b`](https://github.com/hypothesi/a11ied/commit/d94a31b24f04e4be62214b286d215a19d0f10fa9) - `a1 audit dashboard` has a new layout: a status badge, one bar for done, working, blocked,
  and queued units, findings by severity, criteria by result, and done counts per page and
  per test pass. It updates in place every five seconds instead of reloading, so selected
  text, focus, and scroll position are kept, and **Pause updates** stops it. When the server
  stops, the page keeps the last update on screen and says the connection was lost. The
  `a11ied-audit` skill now tells the agent to offer the dashboard when a person is in the
  conversation, start it in the background, and give them its address.

- [`9c131f8`](https://github.com/hypothesi/a11ied/commit/9c131f82be606281c9a711da7bd3843af12c3fc7) - Audit findings now say why they fail. A new finding needs a `reason` for its criterion, and
  each `alsoFails` entry is `{"criterion", "reason"}` instead of a criterion id. The report
  shows the reasons under "Why it fails". A worker that confirms an automated finding must
  describe it in the new `confirm` list of the submission, or dismiss it, so the report no
  longer repeats axe-core's rule text. `a1 audit finding update --reason "<criterion>=<text>"`
  and the `reasons` argument of `audit_finding` edit a reason. A note that refers to another
  page is rejected. The worker guide and work packet explain how to write notes and findings
  in plain, concrete language.

## 0.1.1

### Patch Changes

- [`5a27be9`](https://github.com/hypothesi/a11ied/commit/5a27be9d2e55cfd5a960d88c4a3d07186fdfa273) - `a1 doctor` now says how to fix a missing ffmpeg for Windows recording. When npm skipped
  the `ffmpeg-static` install script, for example with `--ignore-scripts`, the check names
  `npm approve-scripts ffmpeg-static` and `npm rebuild ffmpeg-static`.

## 0.1.0

First release.

- `a1 sr` drives VoiceOver on macOS, NVDA on Windows, or a simulated screen reader on any
  host. A session opens a page, moves through it by item, heading, landmark, form field,
  or other element kind, types and activates controls, and records every phrase the
  reader speaks. `sr expect` and `sr wait` fail a script when an announcement is missing.
- `a1 check` scans one page during development and lists what to fix. `a1 axe` runs
  axe-core against one or more pages, filtered by WCAG criterion, level, or rule. `a1
  tree` prints a page's accessibility tree, and `a1 capture` screenshots a page at a
  viewport, zoom level, focus stop, or opened state.
- `a1 audit` tracks a WCAG audit of a site, page, or app that AI agents carry out: work
  units, findings, progress, and an HTML or JSON report.
- `a1 wcag`, `a1 pattern`, and `a1 search` look up WCAG 2.2 criteria, techniques, axe
  rules, W3C guidance, and ARIA patterns from data shipped with the package, so lookups
  work offline.
- `a1 talkback` turns TalkBack on or off on an Android device and records what it says.
- `a1 doctor` checks the browser and screen reader setup, and `a1 setup` installs what
  the screen readers need.
- `a1 mcp` serves the same features as tools for AI agents over the Model Context
  Protocol.
- `a11ied/test` and `a11ied/vitest` script screen reader sessions from tests, with
  assertions on what was spoken and where the cursor is. `a11ied/browser` runs the
  simulated reader inside Vitest browser mode.
- The `a11ied` and `a11ied-audit` Agent Skills ship in the package under `skills/`.
