# a11ied

`a11ied` is a CLI-first accessibility automation toolkit for real screen reader testing with VoiceOver and NVDA, built on Guidepup.

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
a1 help-all
```

Use the runtime API:

```js
import { listWcagCriteria, runAxe, startDriverSession } from 'a11ied';
```

Drive a screen reader from a test. `a11ied/test` works under any runner, and `a11ied/vitest`
adds `toHaveSpoken`, `toHaveSpokenInOrder`, and `toBeOn` matchers plus a `test` with an `sr`
fixture:

```js
import { screenReader } from 'a11ied/test';

await using sr = await screenReader({ url: 'http://localhost:3000/checkout' });
await sr.goTo({ role: 'button', name: 'Pay' });
await sr.expectSpoken('button, Pay');
```

## workspaces

The repo is split into npm workspaces. `packages/cli` publishes the end-user `a11ied` package, and the scoped `@a11ied/*` libraries are publishable as standalone building blocks.

- `packages/contracts`: shared schemas and result shapes (`@a11ied/contracts`)
- `packages/core`: orchestration and product-level domain logic (`@a11ied/core`)
- `packages/guidepup`: adapter layer for real and virtual screen reader automation (`@a11ied/guidepup`)
- `packages/mcp-server`: MCP bridge around the core runtime (`@a11ied/mcp-server`)
- `packages/wcag-data`: normalized WCAG data artifacts (`@a11ied/wcag-data`)
- `packages/wcag-engine`: lookup and search APIs over the WCAG data package (`@a11ied/wcag-engine`)
- `packages/earl`: builds W3C EARL 1.0 accessibility reports as JSON-LD (`@a11ied/earl`)
- `packages/cli`: end-user command line entrypoint (published as `a11ied`)
- `packages/act-conformance`: runs a11ied against the W3C ACT test cases (not published)
- `packages/docs`: Astro docs site
- `packages/skills/a11ied`: Agent Skill scaffold

## quick start

```sh
npm install
npm run standards
npm test
```

## standards data workflow

When you need to refresh the pinned WCAG artifacts, stay at the repo root and run:

```sh
npm run wcag:sync
npm run wcag:validate
npm run standards
npm test
```

That flow does four things:

- pulls the approved upstream WCAG, ACT, and Quickref sources into `packages/wcag-data/data/raw/`
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
