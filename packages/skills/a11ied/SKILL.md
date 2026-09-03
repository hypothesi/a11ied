---
name: a11ied
description: Use when you need to plan, script, or execute accessibility checks with the a11ied CLI or MCP server. Focus on screen reader behavior first, use Guidepup-backed targets when real assistive technology matters, and fall back to the virtual screen reader for fast local feedback.
---

# a11ied

Use this skill when the task is specifically about the `a11ied` toolchain.

## Workflow

1. Start with the CLI if the task can be expressed as a repeatable command.
2. If the task is framed in WCAG terms, resolve the criterion or target level before testing.
3. Determine whether the criterion is applicable to the page, story, or component under test.
4. Check coverage and testing strategy before making claims.
5. Choose the evidence lane on purpose:
   - automated when the runtime can make the verdict directly
   - hybrid when the runtime can gather evidence but a human still has to judge part of it
   - manual when the runtime can explain the criterion but not finish the call alone
6. Use low-level `sr` commands when the task requires manually operating the UI or screen reader and no reusable pattern fits yet.
7. Use axe where there is rule coverage, and use low-level `sr` commands where interaction or announcement behavior matters.
8. Prefer the virtual screen reader for quick feedback and deterministic local tests.
9. Escalate to VoiceOver or NVDA when the task depends on real assistive technology behavior.
10.   Use the MCP server when an agent or editor should call the same runtime programmatically.
11.   Keep output concrete: commands, findings, evidence, and next actions beat generic accessibility advice.

## Current package map

- `packages/contracts`: shared schemas
- `packages/core`: orchestration and product rules
- `packages/guidepup`: platform adapters
- `packages/mcp-server`: MCP server entrypoint
- `packages/cli`: CLI entrypoint
- `packages/docs`: docs site
- `packages/wcag-data`: normalized WCAG, ACT, Quickref, and axe-derived artifacts
- `packages/wcag-engine`: lookup, search, applicability, and coverage APIs over local artifacts

## Guardrails

- Do not claim simulated screen reader output is equivalent to VoiceOver or NVDA.
- Do not claim full WCAG compliance when the result only covers automated checks.
- Do not confuse raw driver transcripts with WCAG claims.
- Do not skip applicability and jump straight from a target URL to a compliance claim.
- Do not hide uncovered work. If the runtime leaves manual review behind, say so plainly.
- Call out setup requirements before suggesting a real-device run.
- Distinguish between automated, hybrid, and manual evidence.
- Keep repeated driver procedures documented so they can be reviewed and rerun.
- Keep command examples copy-pasteable.
