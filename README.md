# a11ied

`a11ied` is a CLI-first accessibility automation toolkit for real screen reader testing with VoiceOver and NVDA, built on Guidepup.

## install

```sh
npm install a11ied
```

This installs the `a1` CLI command (also available as `a11ied`):

```sh
a1 doctor
a1 wcag show 4.1.3 --json
a1 help-all
```

Use it programmatically:

```js
import { buildCli } from 'a11ied';
```

## workspaces

The repo is split into internal npm workspaces. Only the top-level `a11ied` package is published — it bundles everything.

- `packages/contracts`: shared schemas and result shapes
- `packages/core`: orchestration and product-level domain logic
- `packages/guidepup`: adapter layer for real and virtual screen reader automation
- `packages/storybook`: Storybook-facing helpers and recipes
- `packages/mcp-server`: MCP bridge around the core runtime
- `packages/cli`: end-user command line entrypoint (published as `a11ied`)
- `apps/docs`: Astro docs site
- `skills/a11ied`: Agent Skill scaffold

## quick start

```sh
npm install
npm run standards
```

## standards data workflow

When you need to refresh the pinned WCAG artifacts, stay at the repo root and run:

```sh
npm run wcag:sync
npm run wcag:validate
npm run standards
```

That flow does three things:

- pulls the approved upstream WCAG, ACT, and Quickref sources into `packages/wcag-data/data/raw/`
- regenerates the committed normalized artifacts in `packages/wcag-data/data/generated/`
- checks that lint, typecheck, tests, and builds still pass across the repo

If the generated diffs look wrong, stop there. The provenance manifests and regression fixtures are supposed to make surprising changes obvious.

For the package-level details, see [packages/wcag-data/README.md](/Users/mluedke/code/personal/a11ied/packages/wcag-data/README.md).

## release readiness

The current public release record is [releases/v0.3.0-readiness.md](releases/v0.3.0-readiness.md).

That file is the one to read before a public minor or major cut. It includes:

- publish steps for the `a11ied` package
- docs publish path
- Agent Skill release path
- deferred items that still need an explicit release decision
