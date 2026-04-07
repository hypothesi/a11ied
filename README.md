# a11lied

`a11lied` is a CLI-first accessibility automation toolkit for real screen reader testing with VoiceOver and NVDA, built on Guidepup.

The repo is split into npm workspaces so the CLI, MCP server, Storybook integration, docs site, and shared runtime can evolve without turning into one giant package.

## workspaces

- `packages/contracts`: shared schemas and result shapes
- `packages/core`: orchestration and product-level domain logic
- `packages/guidepup`: adapter layer for real and virtual screen reader automation
- `packages/storybook`: Storybook-facing helpers and recipes
- `packages/mcp-server`: MCP bridge around the core runtime
- `packages/cli`: end-user command line entrypoint
- `apps/docs`: Astro Starlight docs site
- `skills/a11lied`: Agent Skill scaffold

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
```
