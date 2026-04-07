---
name: a11lied
description: Use when you need to plan, script, or execute accessibility checks with the a11lied CLI, Storybook integration, or MCP server. Focus on screen reader behavior first, use Guidepup-backed targets when real assistive technology matters, and fall back to the virtual screen reader for fast local feedback.
---

# a11lied

Use this skill when the task is specifically about the `a11lied` toolchain.

## Workflow

1. Start with the CLI if the task can be expressed as a repeatable command.
2. If the task is framed in WCAG terms, resolve the criterion or target level before testing.
3. Determine whether the criterion is applicable to the page, story, or component under test.
4. Check coverage before making claims.
5. Use low-level `drive` primitives when the task requires manually operating the UI or screen reader and no reusable pattern fits yet.
6. Use axe where there is rule coverage, and use Guidepup-backed patterns where interaction or announcement behavior matters and a named procedure already exists.
7. Prefer the virtual screen reader for quick feedback and deterministic local tests.
8. Escalate to VoiceOver or NVDA when the task depends on real assistive technology behavior.
9. Use the MCP server when an agent or editor should call the same runtime programmatically.
10.   Keep output concrete: commands, findings, evidence, and next actions beat generic accessibility advice.

## Current package map

- `packages/contracts`: shared schemas
- `packages/core`: orchestration and product rules
- `packages/guidepup`: platform adapters
- `packages/storybook`: Storybook bridge
- `packages/mcp-server`: MCP server entrypoint
- `packages/cli`: CLI entrypoint
- `apps/docs`: docs site
- planned: `packages/wcag-data` for normalized WCAG and ACT artifacts
- planned: `packages/wcag-engine` for lookup, search, applicability, and coverage

## Guardrails

- Do not claim simulated screen reader output is equivalent to VoiceOver or NVDA.
- Do not claim full WCAG compliance when the result only covers automated checks.
- Do not confuse raw driver transcripts with criterion verdicts.
- Call out setup requirements before suggesting a real-device run.
- Distinguish between automated, hybrid, and manual evidence.
- Prefer reusable patterns over ad hoc driver steps when the same procedure should be repeated.
- Keep command examples copy-pasteable.
