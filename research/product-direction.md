# product direction and CLI-first shape

Checked on 2026-04-06.

## The core product bet

`a11lied` should feel like one runtime with several doors:

- the CLI is the front door
- Storybook is the fast local side door
- MCP is the agent door
- the docs site explains the system without becoming the system

If those surfaces do different things or speak different data shapes, the product will get messy almost immediately.

## The first CLI I would ship

### `a11lied doctor`

This needs to be boring and solid. Detect the host OS, installed dependencies, Guidepup readiness, and target availability. Print plain English by default. Print JSON when asked.

### `a11lied init`

Write a config file, a sample scenario, and the right next-step commands for the current machine. Keep it guided when run interactively, quiet when run with flags.

### `a11lied wcag`

This is the knowledge layer. It should list criteria by level, show docs for a criterion, search the local corpus, and explain coverage. Without this, the agent has to keep rediscovering the standards model from scratch.

### `a11lied inspect`

This should answer "which criteria are relevant to this page or story?" The output should be a criterion matrix with applicability reasons, not a vague recommendation blob.

### `a11lied drive`

This is the raw accessibility-driver layer. It should let a human or agent start a target, send user keys and screen-reader chords, move next and previous, enter and leave interaction mode, type text, and read back speech or item-text logs. Without this layer, the tool will feel boxed in the first time somebody hits a custom widget or a bug that does not match a canned pattern.

### `a11lied run`

This is the execution layer. It should support:

- scenarios
- axe-backed scans
- reusable Guidepup-backed interaction patterns built on the driver layer

The output should include:

- summary
- spoken phrase log
- assertion failures
- machine-readable result payload

### `a11lied verify`

This is the compliance orchestration layer. It should verify a specific criterion or a target level, then report what passed, failed, was not applicable, and was not covered.

### `a11lied story <story-id>`

This should feel like the bridge between component work and real screen reader testing. The command should know how to talk to a local Storybook server and resolve the story iframe without making the user hand-roll URLs every time.

### `a11lied mcp`

This should not invent a new model. It should expose the same lookup, driver, scenario execution, health checks, and results through MCP tools and resources.

## What the shared runtime needs

- one config model
- one scenario model
- one result model
- one target abstraction
- one driver session model
- one reporter pipeline
- one WCAG data package
- one coverage model
- one applicability model

That is the line that keeps the whole repo honest.

## Opinionated product rules

- Treat the virtual screen reader as a speed layer.
- Treat VoiceOver and NVDA as behavior truth.
- Never hide the raw spoken output.
- Expose the raw driver, but do not confuse driver transcripts with compliance verdicts.
- Never claim full compliance when coverage is partial.
- Fail clearly when the machine is not ready.
- Default to small, scriptable commands over giant wizard flows.
- Prefer local, versioned WCAG data over live fetches during normal command execution.

## Current library assumptions

- Node.js: 24.13.1 in the local setup
- npm: 11.8.0 in the local setup
- TypeScript: 6.0.2
- Vitest: 4.1.2
- Astro: 6.1.4
- Storybook core: 10.3.4
- MCP SDK: 1.29.0
- Guidepup core: 0.24.1
- axe-core docs reviewed against 4.11
- WAI WCAG 2.2 JSON available at `https://www.w3.org/WAI/WCAG22/wcag.json`

## Sources

- MCP SDK README: https://www.npmjs.com/package/@modelcontextprotocol/sdk
- MCP specification version 2025-06-18: https://modelcontextprotocol.io/specification/2025-06-18
- Guidepup docs home: https://guidepup.dev
- WAI WCAG 2.2 JSON: https://www.w3.org/WAI/WCAG22/wcag.json
- axe-core API docs: https://github.com/dequelabs/axe-core/blob/develop/doc/API.md
- Astro docs: https://docs.astro.build
- Vitest docs: https://vitest.dev
