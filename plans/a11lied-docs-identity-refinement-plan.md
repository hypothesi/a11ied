# a11ied docs identity refinement: implementation plan (v0.1.0 - 2026-04-09)

## Summary

Refine the docs visual identity so it feels like a11ied's own field manual rather than a tasteful but familiar AI-era docs theme with a stronger palette.

## Objectives & scope

- In scope: font and color refinement, tone-setting shell details, page-level visual cues, and content polish that supports a more distinctive docs identity.
- Out of scope: a full rebrand for the repo, logo design work outside the docs shell, or visual changes that make the site less usable.

## Assumptions & open questions

- Assumptions: the docs should feel technical, opinionated, and grounded; they should not feel like a startup marketing page or a generic template with nicer colors.
- Open questions: none.

## Requirements

### Functional

- FR-1: The docs shell must use a visual system that feels distinct from the current Fraunces plus IBM Plex pattern.
- FR-2: The shell must reinforce the "technical field manual" tone with restrained but memorable details.
- FR-3: The final docs surface must stay accurate and honest about the shipped product.

### Non-functional

- NFR-1 (Accessibility): Identity changes must preserve contrast and readability.
- NFR-2 (Performance): Branding changes must stay lightweight.
- NFR-3 (Observability): Regression checks must keep the public docs surface honest after the redesign.
- NFR-4 (Maintainability): Identity choices should live in the shell tokens and reusable patterns, not scattered page hacks.

## Architecture & design overview

- Use the shared shell as the main identity surface.
- Pick a more distinctive font pairing and tuned palette that still fits technical documentation.
- Add restrained visual details that feel like notes, routes, field marks, or operational guidance instead of generic product-site polish.
- Use content edits sparingly to keep the tone sharp and specific.

## Task grid

| Status | ID    | Task                                                           | Priority | Depends On | Acceptance Criteria                                                                                  |
| ------ | ----- | -------------------------------------------------------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| [✓]    | IR-01 | Refine the docs visual identity in the shared shell            | H        | —          | The shell has a more distinctive type and color system that still reads clearly                      |
| [✓]    | IR-02 | Audit public docs surfaces for honesty after the redesign      | H        | IR-01      | The redesigned pages still match the shipped CLI, MCP, and package surface with no fake completeness |
| [✓]    | IR-03 | Reconcile release-truth notes, plan state, and manual evidence | H        | IR-02      | Release notes, plans, traceability, manual evidence, and the live docs all agree                     |

## Task details

### IR-01 - Refine the docs visual identity in the shared shell

**Goal:** Make the site feel less like a polished default.

**Step-by-step instructions:**

1. Replace the current reflex font pairing with a more specific pairing that suits a technical field manual.
2. Retune the palette so neutrals, accents, and dark surfaces feel intentional and consistent.
3. Add restrained visual cues in the shell that support orientation and tone without turning into decorative clutter.
4. Recheck the shell across all pages after the identity pass.

### IR-02 - Audit public docs surfaces for honesty after the redesign

**Goal:** Avoid a prettier lie.

**Step-by-step instructions:**

1. Audit the homepage, CLI docs, MCP docs, workflow pages, and release checklist for stale or misleading claims.
2. Remove placeholder-feeling labels or copy that makes the system sound more complete than it is.
3. Update docs regression coverage where the honesty guardrails moved.

### IR-03 - Reconcile release-truth notes, plan state, and manual evidence

**Goal:** Make the redesigned docs trustworthy in both substance and presentation.

**Step-by-step instructions:**

1. Update the identity-refinement plan status after the audit is truly complete.
2. Update any release-readiness notes touched by the docs audit.
3. Manually exercise the built docs site and record the review under `specs/manual-runs/IR-03/`.
4. Run `npm run standards`.

## New code

- `apps/docs/src/layouts/doc-shell.astro`: final shell identity system.
- `apps/docs/src/pages/*.astro`: copy or structure adjustments required by the honesty audit.
- `releases/v0.3.0-readiness.md` or later readiness notes if the docs audit surfaces mismatches.
- Docs regression tests and manual-run evidence for the identity pass.

## Tests

- Keep public-surface honesty checks in docs regression coverage.
- Verify docs build and typecheck still pass after the shell changes.
- Run `npm run standards`.

## Review checklist

[✓] Have all outstanding questions been answered?
[✓] Are there any ambiguities that need to resolved?
