# a11ied

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
