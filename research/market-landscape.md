# a11lied market landscape

Checked on 2026-04-06.

## What exists right now

| Tool | Current version checked | What it does well | Where it falls short for a11lied |
| --- | --- | --- | --- |
| Pa11y | 9.1.1 | Clear CLI, sensible reporters, useful exit codes, good for URL scanning | It is still rules-based page analysis. It does not tell you what VoiceOver or NVDA actually says. |
| axe-core | 4.11.2 | Strong rules engine, mature ecosystem, easy to embed | Same ceiling as every rule engine. It catches real problems, but not the full screen reader experience. |
| Storybook addon-a11y | 10.3.4 | Fast component-level feedback inside Storybook | Great for dev ergonomics. Not a real assistive technology run. |
| storybook-screen-reader | 1.1.0 | Helpful "what might a screen reader say?" simulation in Storybook | The package is honest about the limit. It is focus-based browser simulation, not OS-level screen reader automation. |
| Guidepup | `@guidepup/guidepup` 0.24.1, `@guidepup/setup` 0.21.0, `@guidepup/virtual-screen-reader` 0.32.1, `@guidepup/playwright` 0.15.0 | This is the real differentiator. One API for VoiceOver and NVDA, plus a virtual screen reader for fast local tests. | It is a toolkit, not a full product. You still have to design the workflow, config, reports, Storybook bridge, and DX yourself. |
| `@weaaare/mcp-nvda-auditor` | 0.1.1 | Proof that agent-facing screen reader automation is already becoming useful | It is NVDA-only, Windows-only, and audit-oriented. It is not the broad CLI suite a11lied wants to be. |

## What that means

There is no shortage of accessibility tools. There is a shortage of tools that feel cohesive when the job is "tell me what the screen reader actually does, wire that into local dev, and let me run it from a terminal or an agent."

That gap matters because the current stack is fragmented:

- Rule engines catch a slice of failures, then stop.
- Storybook add-ons help during component work, then stop.
- Real screen reader automation exists through Guidepup, but the product layer is mostly your problem.
- Agent-facing MCP servers are starting to show up, but they are still narrow and platform-specific.

## Where a11lied can win

The opening is not "one more scanner." That would be a crowded lane.

The opening is a clean operator workflow:

- Start in the CLI.
- Make setup obvious with `doctor`.
- Keep scenario authoring small and readable.
- Let Storybook runs feel local and immediate.
- Expose the same runtime through MCP instead of building a second product surface.
- Treat the virtual screen reader as fast feedback, not fake parity.
- Treat VoiceOver and NVDA as the truth when behavior matters.

## Sources

- Guidepup README: https://www.npmjs.com/package/@guidepup/guidepup
- Guidepup Setup README: https://www.npmjs.com/package/@guidepup/setup
- Guidepup Virtual Screen Reader README: https://www.npmjs.com/package/@guidepup/virtual-screen-reader
- Guidepup Playwright README: https://www.npmjs.com/package/@guidepup/playwright
- Pa11y README: https://github.com/pa11y/pa11y
- storybook-screen-reader: https://www.npmjs.com/package/storybook-screen-reader
- MCP NVDA Auditor: https://www.npmjs.com/package/@weaaare/mcp-nvda-auditor
