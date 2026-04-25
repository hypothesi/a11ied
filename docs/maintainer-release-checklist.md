# a11ied maintainer release checklist

This is a maintainer-facing release checklist for the monorepo. It is not part of the public docs site because it describes internal release mechanics, CI, and package publication workflow.

## Pre-release steps

1. Wait for all CI checks to pass.
2. Run a manual macOS VoiceOver smoke pass on representative fixtures or demo targets.
3. Run a manual Windows NVDA smoke pass on representative fixtures or demo targets.
4. Review deferred items and make an explicit accept-or-block decision for each.
5. Record what was exercised and any environment constraints that applied.

## Required commands

```sh
npm run standards
npm test
npm run pack:check
a1 help-all
a1 doctor --json
```

## Release record

The current release record lives in `releases/v0.3.0-readiness.md`. It documents the package release order, the docs publish path, the Agent Skill release path, and deferred items.

## Publish order

1. Publish `@a11ied/contracts`.
2. Publish `@a11ied/wcag-data`.
3. Publish `@a11ied/wcag-engine`.
4. Publish `@a11ied/guidepup`.
5. Publish `@a11ied/core`.
6. Publish `@a11ied/mcp-server`.
7. Publish `a11ied`.
8. Publish docs from `apps/docs/dist/`.
9. Ship `skills/a11ied/` only after the skill text matches the released CLI and MCP behavior.

Use the `publish-packages` GitHub Actions workflow for package publication after `npm run standards`, `npm test`, and `npm run pack:check` pass.

## Known deferred items

Some rough edges are tracked and accepted for the current milestone. Real-target smoke testing is still manual even though package publication now runs through GitHub Actions. See the release record for the full list.

## Manual smoke tests are required

VoiceOver and NVDA are the primary target platforms. The virtual reader is useful for fast iteration, but releases require confirmation on real assistive technology.
