# a11ied

`a11ied` is a CLI-first accessibility automation toolkit. It ships the `a1` (also `a11ied`) command and a programmatic API for WCAG lookup, axe-core scanning, screen reader control, and runtime diagnostics.

## install

```sh
npm install a11ied
```

After installing, run `a1 doctor` to confirm which browser and screen reader targets are available.

## CLI

```sh
a1 doctor                          # check runtime setup
a1 wcag show 4.1.3 --json          # look up a criterion
a1 inspect criterion 4.1.3 --url <url> --json  # check applicability
a1 axe --url <url> --json          # run axe-core scan
a1 sr start --json                 # start a screen reader session
a1 sr next --session <id> --json   # move to next element
a1 sr read --session <id> --json   # read current element
a1 sr stop --session <id> --json   # end session
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

- `voiceover` — real VoiceOver (macOS only)
- `nvda` — real NVDA (Windows only)
- `virtual` — headless virtual screen reader backed by `@guidepup/virtual-screen-reader`

Pass `--target virtual --allow-virtual` for fast, deterministic local runs.
