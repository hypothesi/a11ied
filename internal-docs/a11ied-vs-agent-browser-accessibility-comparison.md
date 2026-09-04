# a11ied vs agent-browser: Accessibility Feature Comparison

This document compares the **accessibility-specific features** of **a11ied** against **agent-browser** (vercel-labs/agent-browser) and outlines potential improvements for a11ied.

**Important architectural distinction**: a11ied is **not a browser automation tool**. It is an accessibility testing tool that _uses_ browser automation backends (Playwright, guidepup, Chrome DevTools Protocol) to perform automated and agent-driven a11y testing. agent-browser is a full browser automation CLI. This comparison focuses only on the accessibility review capabilities that a11ied could adopt or improve.

---

## Executive Summary

| Aspect                    | a11ied                                                 | agent-browser                                              |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| **Primary Focus**         | Accessibility-first CLI with deep WCAG integration     | Browser automation for AI agents with embedded a11y audits |
| **Architecture**          | TypeScript monorepo using pluggable browser backends   | Native Rust CLI with embedded Chromium                     |
| **Axe-core Integration**  | Full programmatic API, tag/level/criterion selection   | Single `a11y` command with tag/selector filtering          |
| **Accessibility Tree**    | Via guidepup/virtual screen reader                     | Native `snapshot` command with element refs                |
| **WCAG Integration**      | Deep (pinned criteria, coverage, applicability engine) | Basic (axe tags only: `wcag2a`, `wcag2aa`, etc.)           |
| **Screen Reader Testing** | First-class (VoiceOver, NVDA, virtual)                 | Not a focus                                                |
| **MCP Support**           | Yes (stdio server)                                     | Yes (typed tools, profiles)                                |
| **Diff/Regression**       | Not implemented                                        | Snapshot diff, screenshot diff, URL diff                   |
| **React/Web Vitals**      | Not implemented                                        | First-class React tree, renders, Web Vitals                |

---

## Detailed Feature Comparison

### 1. Accessibility Audits (axe-core)

#### a11ied (Current)

```typescript
// Programmatic API
await runAxe(url, {
   wcagVersion: '2.2',
   criterion: '1.1.1', // Specific WCAG criterion
   // or level: 'AA',
   // or ruleIds: ['image-alt', 'color-contrast']
});
```

- **Strengths**: WCAG criterion/level mapping, caching, structured results with `selection` metadata
- **Gap**: No ergonomic CLI command for quick ad-hoc audits

#### agent-browser

```bash
agent-browser a11y                          # Current page
agent-browser a11y https://example.com      # Navigate + audit
agent-browser a11y --tags wcag2a,wcag2aa    # Filter by axe tags
agent-browser a11y --selector "#main"       # Scope to subtree
agent-browser a11y --json                   # Structured output
```

- **Strengths**: Single command, embedded engine (offline, CSP-safe), frame-tree merging, shadow DOM paths preserved
- **Limitation**: No WCAG criterion mapping (only axe tags), no applicability engine

**Improvement for a11ied**: Enhance the existing `axe` CLI command with:

- `--tags` filtering (wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice, etc.)
- `--selector` for subtree scoping
- `--json` output matching axe-core structure
- Frame/shadow DOM path preservation
- Works with any configured browser backend (Playwright, CDP, etc.)

---

### 2. Accessibility Tree Snapshots

#### a11ied (Current)

- Uses guidepup virtual adapter for accessibility tree access
- No direct CLI command for tree inspection

#### agent-browser

```bash
agent-browser snapshot          # Accessibility tree with refs
agent-browser snapshot -i       # Include ignored/hidden elements
```

Output includes stable element refs (`@e1`, `@e2`, ...) for subsequent reference:

```
@e1 [document] "Example Domain"
@e2 [heading] "Example Domain"
@e3 [paragraph] "This domain is for use in illustrative examples..."
@e4 [link] "More information..."
```

**Improvement for a11ied**: Add `snapshot` command that:

- Outputs accessibility tree with stable element identifiers
- Supports `-i` / `--include-hidden` flag
- Works with any configured backend (Playwright CDP, guidepup virtual, etc.)
- Outputs structured data (JSON) for agent consumption
- Does NOT include interaction commands (click, fill) — a11ied is for testing, not automation

---

### 3. Semantic Element Location (ARIA-based)

#### a11ied (Current)

- Can inspect criterion applicability for targets
- No semantic locator commands

#### agent-browser

```bash
agent-browser find role button click --name "Submit"
agent-browser find role heading text --name "Skills"
agent-browser find label "Email" fill "test@test.com"
agent-browser find text "Sign In" click
agent-browser find alt "Logo" click
agent-browser find placeholder "Search" fill "query"
agent-browser find testid "submit-btn" click
```

- **Actions**: `click`, `fill`, `check`, `hover`, `text`
- **Filters**: `--name` (accessible name), `--exact` (case-sensitive)

**Improvement for a11ied**: Add read-only semantic find commands for _inspection_:

- `a11ied find role <role> [--name <name>]` — returns matching elements with accessibility details
- `a11ied find label <label>` — finds elements by accessible label
- `a11ied find text <text>` — finds elements by text content
- `a11ied find alt <text>` — finds images by alt text
- `a11ied find testid <id>` — finds elements by data-testid
- Returns structured data: role, name, description, states, properties, bounding box
- **No interaction actions** — purely for accessibility inspection/auditing

---

### 4. WCAG Integration Depth

#### a11ied (SUPERIOR - Keep)

- **Pinned WCAG data**: Criteria, techniques, understanding docs, applicability rules
- **Coverage analysis**: Which criteria are testable via automation vs manual
- **Applicability engine**: Determines which criteria apply to a given target
- **Criterion lookup**: `wcag` command with search, coverage, strategy

#### agent-browser

- Only axe-core tag filtering (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`)
- No criterion-level mapping, no techniques, no applicability

**Keep a11ied's advantage**: This is a core differentiator. Consider exposing more of this via MCP tools.

---

### 5. Screen Reader Testing

#### a11ied (SUPERIOR - Keep)

- **Virtual screen reader**: Cross-platform, fast feedback loops
- **VoiceOver (macOS)**: Native automation via guidepup
- **NVDA (Windows)**: Native automation via guidepup
- **Stable sessions**: `sr` command family for controlling SR sessions

#### agent-browser

- No screen reader integration
- Accessibility tree snapshots only (no live SR output)

**Keep a11ied's advantage**: This is unique value. Consider adding SR output to MCP tools.

---

### 6. Diff & Regression Testing

#### a11ied (Current)

- Not implemented

#### agent-browser

```bash
agent-browser diff snapshot                    # Current vs last snapshot
agent-browser diff snapshot --baseline before.txt
agent-browser diff screenshot --baseline before.png
agent-browser diff url https://v1.com https://v2.com
agent-browser diff url https://v1.com https://v2.com --screenshot
agent-browser diff url --selector "#main"      # Scoped diff
```

**Improvement for a11ied**: Add accessibility-specific diff commands:

- `a11ied diff snapshot` — Compare accessibility trees (role/name/state changes)
- `a11ied diff axe` — Compare axe results between runs (new/fixed violations)
- `a11ied diff wcag` — Compare WCAG criterion applicability results
- Integration with CI for regression detection
- Works with any backend; baseline can be stored as JSON artifacts

---

### 7. MCP Server Capabilities

#### a11ied (Current)

- Basic MCP stdio server exposing core functions

#### agent-browser

- **Typed tools** with profiles (`core`, `network`, `react`, `debug`, `tabs`, `mobile`, `all`)
- **Accessibility audit tool** in `debug` profile
- **Structured approval prompts** via typed fields (`allowedDomains`, `idleTimeout`)
- **Pagination** for large tool surfaces
- **Session isolation** via `session` parameter

**Improvement for a11ied**: Enhance MCP server for accessibility workflows:

- Add tool profiles: `a11y-audit`, `a11y-inspect`, `wcag-lookup`, `sr-testing`
- Expose `a11y` audit, `snapshot`, `find`, `wcag` as MCP tools
- Add structured result types for accessibility data (violations, tree nodes, criterion details)
- Implement pagination for tool discovery

---

### 8. React & Component Accessibility

#### a11ied (Current)

- Not implemented

#### agent-browser

```bash
agent-browser open --enable react-devtools <url>
agent-browser react tree              # Component tree
agent-browser react inspect <fiberId> # Props, hooks, state, source
agent-browser react renders start/stop
agent-browser vitals [url] --json     # LCP/CLS/TTFB/FCP/INP + hydration
```

**Improvement for a11ied**: Add React/component accessibility inspection (via CDP):

- `a11ied react a11y-tree` — Accessibility tree with React component names
- `a11ied react inspect <component>` — Check component for missing labels, roles, ARIA
- `a11ied vitals` — Web Vitals correlation with accessibility issues
- Leverages existing CDP connection; no browser automation needed

---

## Priority Recommendations for a11ied

### P0 - High Impact, Low Effort (Accessibility-specific)

1. **Enhance `axe` CLI command** with agent-browser's ergonomics
   - `--tags`, `--selector`, `--json` flags
   - Works with any configured backend (no navigation built-in)

2. **Add `snapshot` command** for accessibility tree with identifiers
   - Integrate with existing driver sessions
   - Support `--include-hidden` flag
   - Output structured JSON for agents

3. **Add read-only semantic `find` commands** (role, label, text, alt, testid)
   - Returns accessibility details for inspection
   - No interaction actions (click, fill) — a11ied is for testing

### P1 - Medium Effort, High Value

4. **Enhance MCP server** with accessibility tool profiles
   - Expose `a11y`, `snapshot`, `find`, `wcag` as MCP tools
   - Add `a11y-audit` and `a11y-inspect` profiles

5. **Add accessibility diff commands** for regression testing
   - `diff snapshot` (tree structure changes)
   - `diff axe` (violation changes)
   - `diff wcag` (criterion applicability changes)
   - CI-friendly JSON output

### P2 - Strategic Differentiators (Keep & Enhance)

6. **Keep WCAG depth** — This is a11ied's unique value
7. **Keep screen reader testing** — Unique in the market
8. **Add React/component accessibility inspection** — Modern app testing

---

## What NOT to Adopt from agent-browser

| Feature                                                           | Reason                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Browser session management (`--session`, `--profile`, auth vault) | a11ied uses pluggable backends; session management belongs in the backend |
| Navigation commands (`open`, `goto`, `back`, `forward`)           | a11ied tests pages provided by the user/agent                             |
| Interaction commands (`click`, `fill`, `type`, `hover`)           | a11ied is for accessibility _testing_, not automation                     |
| Tab/window/frame management                                       | Backend concern                                                           |
| Network interception, HAR, cookies, storage                       | Backend concern                                                           |
| Video recording, traces, DevTools                                 | Backend concern                                                           |
| Batch execution of browser commands                               | a11ied runs accessibility workflows, not browser scripts                  |

---

## Implementation Notes

### Architecture Alignment

- New CLI commands follow existing patterns: `executeCommand`, renderers, backend-agnostic
- All new commands work with any configured backend (Playwright, CDP, guidepup virtual)
- MCP tools align with existing core exports
- No changes to backend abstraction layer needed

### Testing

- Add e2e tests for new CLI commands using Playwright + virtual backend
- Test with virtual screen reader for fast feedback
- Test with real VoiceOver/NVDA via guidepup for validation

---

## Conclusion

a11ied has **superior WCAG integration and screen reader testing** — these are unique differentiators that should be preserved and enhanced.

agent-browser has **superior accessibility inspection ergonomics** (single-command audits, tree snapshots, semantic find, diff) — these would significantly improve a11ied's usability for AI agents and CI workflows **without changing a11ied's scope**.

**The ideal path**: Keep a11ied's WCAG/SR depth as the core value proposition; adopt agent-browser's accessibility _inspection ergonomics_ (commands, output formats, MCP tools) to make a11ied the best accessibility testing interface for agents and automation.
