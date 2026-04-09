# a11ied docs layout rhythm: implementation plan (v0.1.0 - 2026-04-09)

## Summary

Break the current pattern where nearly every docs section is the same rounded panel with the same accent treatment, and replace it with a layout system that varies pace, density, and composition without getting messy.

## Objectives & scope

- In scope: section treatments, grid and stack patterns, spacing rhythm, page composition, and page-specific variants that reduce the current template feel.
- Out of scope: inventing decorative flourishes that have nothing to do with the docs content, or turning the site into a visual experiment that gets in the way of reading.

## Assumptions & open questions

- Assumptions: the current site is visually consistent but too repetitive; layout and spacing are the bigger problem here, not a lack of ornament.
- Open questions: none.

## Requirements

### Functional

- FR-1: Not every major section should use the same container treatment.
- FR-2: The homepage and key reference pages must use more than one content rhythm, such as open prose, dense reference rows, split layouts, or highlighted workflow blocks.
- FR-3: Important content must still remain visually grouped and scannable.

### Non-functional

- NFR-1 (Accessibility): Layout changes must preserve reading order and not depend on decorative motion.
- NFR-2 (Performance): The redesign should remain mostly CSS-driven.
- NFR-3 (Observability): Regression checks must keep the required routes and content markers intact while the page composition changes.
- NFR-4 (Maintainability): Section variants should be intentional classes or patterns, not one-off inline styling.

## Architecture & design overview

- Define a small set of section variants in the shell:
   - open prose band
   - dense reference band
   - highlighted field note or caution
   - split two-column or asymmetrical group where the content supports it
- Use these variants differently across the homepage, CLI, MCP, and workflow-heavy pages.
- Reduce the dependence on the current universal top accent bar.

## Task grid

| Status | ID    | Task                                                              | Priority | Depends On | Acceptance Criteria                                                                   |
| ------ | ----- | ----------------------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------- |
| [✓]    | VR-01 | Introduce section variants and spacing rhythm in the shared shell | H        | —          | The docs shell supports more than one section treatment and a stronger spacing system |
| [✓]    | VR-02 | Recompose the highest-traffic docs pages with the new variants    | H        | VR-01      | Homepage and key docs pages no longer feel like the same panel repeated               |
| [✓]    | VR-03 | Reconcile docs audit, manual evidence, and plan status            | H        | VR-02      | The changed built pages are manually reviewed, traced, and standards-clean            |

## Task details

### VR-01 - Introduce section variants and spacing rhythm in the shared shell

**Goal:** Give the docs layout a real vocabulary.

**Step-by-step instructions:**

1. Add section-variant classes or patterns to the shared docs shell.
2. Replace the universal accent-bar card treatment with a smaller set of more deliberate options.
3. Tighten the spacing scale so sections can feel dense or roomy on purpose.
4. Verify the base shell still works across all docs routes.

### VR-02 - Recompose the highest-traffic docs pages with the new variants

**Goal:** Apply the new layout vocabulary where readers will feel it first.

**Step-by-step instructions:**

1. Recompose the homepage with a mix of workflow bands, quick-reference rows, and open explanatory copy.
2. Recompose `cli-reference`, `mcp-usage`, and at least one workflow-heavy page with the new section variants.
3. Remove repetitive structure where it adds no value.
4. Recheck the visual hierarchy after each page pass.

### VR-03 - Reconcile docs audit, manual evidence, and plan status

**Goal:** Prove the layout work improved the site instead of just moving boxes around.

**Step-by-step instructions:**

1. Update the plan and traceability state after the page recomposition is complete.
2. Manually exercise the built docs pages changed in this pass and record the review under `specs/manual-runs/VR-03/`.
3. Run `npm run standards`.

## New code

- `apps/docs/src/layouts/doc-shell.astro`: section-variant and spacing-system changes.
- `apps/docs/src/pages/index.astro`, `cli-reference.astro`, `mcp-usage.astro`, and other high-traffic routes: recomposed layouts using the new variants.
- Docs regression tests and manual-run evidence for the layout pass.

## Tests

- Keep required routes and content markers covered in docs regression tests.
- Verify the docs app builds and typechecks after the composition changes.
- Run `npm run standards`.

## Review checklist

[✓] Have all outstanding questions been answered?
[✓] Are there any ambiguities that need to resolved?
