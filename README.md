![a11ied: automated screen reader and WCAG testing](.github/assets/header.png)

`a11ied` is a CLI-first accessibility toolkit. It does three jobs:

- **Look things up**: WCAG criteria, techniques, test methods, and ARIA patterns, pinned from the W3C sources.
- **Check while you build**: axe scans, the accessibility tree, screenshots at a viewport or focus stop, real screen reader sessions with VoiceOver and NVDA through Guidepup, and TalkBack on Android over adb.
- **Audit**: run an agent-driven WCAG audit of a site, page, feature, or mobile app, with durable progress, parallel workers, a live dashboard, and a client-ready report.

## install

```sh
npm install a11ied
```

This installs the `a1` CLI command (also available as `a11ied`):

```sh
a1 doctor                    # check this machine and list the setup steps still needed
a1 setup                     # run the Guidepup setup steps for VoiceOver or NVDA, then re-check
a1 wcag 4.1.3                # one criterion: techniques, failures, test method, next command
a1 wcag rule color-contrast  # an axe rule mapped back to its criteria and fixes
a1 pattern combobox          # the ARIA pattern: its keyboard and attribute tables
a1 check http://localhost:3000  # scan one page while you build
a1 help-all
```

## audit a site, page, or app

```sh
a1 audit init https://example.com --rule "Do not submit the contact form"
a1 audit discover            # add the site's pages to the audit
a1 audit scan                # automated checks on every page, in parallel
a1 audit next --worker w1    # each parallel agent claims a unit, tests it, and submits
a1 audit status              # progress at any time; a1 audit dashboard serves a live page
a1 audit report              # HTML, Markdown, and JSON
```

An audit is a set of pages (pages, screens, states, flows) and the success criteria in
scope. The work is split into units, one test pass on one page, that agents claim and
test in parallel. Automated checks record the failures a scanner is certain of and collect
facts for the agents. An agent decides every pass and every not-applicable. State lives in
`.a11ied/audits/<id>/`, so an audit survives a crashed agent or a restart.

Narrow the scope with `--page` (one page), `--criteria 1.4.3,2.4.7`, `--passes keyboard`,
or `--platform ios`. On web, the scan lists the controls on each page that open a menu,
dialog, tab, or section, and a submission must account for every one. A finding gives a
selector for the failing element, and `a1` takes an outlined screenshot of it for the
report. The [audit guide](packages/docs/src/pages/guides/audit.astro) covers the workflow,
and [internal-docs/audit-architecture.md](internal-docs/audit-architecture.md)
explains the design. Agents use the `a11ied-audit` skill in `packages/skills/`.

Use the runtime API:

```js
import { listWcagCriteria, runAxe, startDriverSession } from 'a11ied';
```

Drive a screen reader from a test. `a11ied/test` works under any runner, and `a11ied/vitest`
adds `toHaveSpoken`, `toHaveSpokenInOrder`, and `toHaveCursorOn` matchers plus a `test`
whose `sr` fixture is a queued screen reader, so a test writes no `await` until it needs a
value. Commands and checks chain, and a check waits up to five seconds for its phrase:

```js
import { queuedScreenReader } from 'a11ied/test';

await using sr = await queuedScreenReader({ url: 'http://localhost:3000/checkout' });

sr.goTo({ role: 'button', name: 'Pay' })
   .press('Enter')
   .expect.spoken('dialog, Confirm payment')
   .and.cursorOn({ role: 'button', name: 'Confirm' });
```

## workspaces

The repo is split into npm workspaces. `packages/cli` publishes the end-user `a11ied` package, and the scoped `@a11ied/*` libraries are publishable as standalone building blocks.

- `packages/contracts`: shared schemas and result shapes (`@a11ied/contracts`)
- `packages/audit`: audit storage, work units, findings, progress, dashboard, and reports (`@a11ied/audit`)
- `packages/core`: browser, axe, screen reader driver, audit scans, and page checks (`@a11ied/core`)
- `packages/guidepup`: adapter layer for real and virtual screen reader automation (`@a11ied/guidepup`)
- `packages/mcp-server`: MCP bridge around the core runtime (`@a11ied/mcp-server`)
- `packages/wcag-data`: normalized WCAG data artifacts (`@a11ied/wcag-data`)
- `packages/wcag-engine`: lookup and search APIs over the WCAG data package (`@a11ied/wcag-engine`)
- `packages/earl`: builds W3C EARL 1.0 accessibility reports as JSON-LD (`@a11ied/earl`)
- `packages/cli`: end-user command line entrypoint (published as `a11ied`)
- `packages/act-conformance`: runs a11ied against the W3C ACT test cases (not published)
- `packages/docs`: Astro docs site
- `packages/knowledge`, `packages/observe`: page signal extraction and page measurements used by scans
- `packages/skills`: the `a11ied` (development checks) and `a11ied-audit` (audits) Agent Skills

## quick start

```sh
npm install
npm run standards
npm test
```

## standards data workflow

See [maintaining the WCAG data](internal-docs/maintaining-wcag-data.md) for what the
data files hold. When you need to refresh the pinned WCAG artifacts, stay at the repo root
and run:

```sh
npm run wcag:sync
npm run wcag:validate
npm run standards
npm test
```

That flow does four things:

- pulls the approved upstream WCAG, ACT, Quickref, WCAG2Mobile, and ARIA Authoring Practices Guide sources into `packages/wcag-data/data/raw/` and the generated artifacts
- regenerates the committed normalized artifacts in `packages/wcag-data/data/generated/`
- checks that lint, typecheck, and builds still pass across the repo
- runs the full Vitest suite through the dedicated `npm test` entrypoint

If the generated diffs look wrong, stop there. The provenance manifests and regression fixtures are supposed to make surprising changes obvious.

For the package-level details, see [packages/wcag-data/README.md](packages/wcag-data/README.md).

## release readiness

The current release record is [internal-docs/releases/v0.1.0-readiness.md](internal-docs/releases/v0.1.0-readiness.md).

That file is the one to read before a public minor or major cut. It includes:

- publish steps for all public npm packages
- docs publish path
- Agent Skill release path
- deferred items that still need an explicit release decision
