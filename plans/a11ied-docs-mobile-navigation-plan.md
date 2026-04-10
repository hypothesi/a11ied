# a11ied docs mobile navigation: implementation plan (v0.1.0 - 2026-04-09)

## Summary

Fix the docs shell so mobile readers see content in the first viewport instead of a thousand-pixel wall of navigation, while keeping route discovery and page context intact on larger screens.

## Objectives & scope

- In scope: responsive shell layout, mobile navigation behavior, top-level wayfinding, touch targets, sticky context elements, and supporting tests and manual exercise.
- Out of scope: rewriting every docs page body, adding search, or changing the docs route list itself beyond what the shell needs.

## Assumptions & open questions

- Assumptions: the current left rail remains useful on desktop but needs a different presentation on narrow screens; the mobile experience should favor getting to content first and navigation second.
- Open questions: none.

## Requirements

### Functional

- FR-1: On screens below the mobile breakpoint, primary content must start inside the first viewport without requiring the full navigation rail to be read first.
- FR-2: The docs shell must expose a clear mobile navigation control that opens and closes the route list.
- FR-3: The current page title and section context must remain visible even when the full nav is collapsed.
- FR-4: Navigation controls must remain keyboard reachable and touch friendly.

### Non-functional

- NFR-1 (Performance): The shell must not rely on a large client-side navigation framework.
- NFR-2 (Accessibility): Mobile navigation must support keyboard, touch, and reduced-motion users.
- NFR-3 (Observability): Regression tests must prove the mobile shell exposes the nav control and the key docs routes.
- NFR-4 (Maintainability): The shell should use one layout system that scales from phone to desktop instead of separate page variants.

## Architecture & design overview

- Keep one Astro shell component.
- Replace the always-open mobile rail with a compact top bar and revealable route drawer or panel.
- Move context cues such as the current page title, section label, or quick-jump links into the content column so the reader stays oriented after the nav collapses.
- Use semantic buttons and minimal script for nav state if pure CSS is too brittle.

## Task grid

| Status | ID    | Task                                                          | Priority | Depends On | Acceptance Criteria                                                                       |
| ------ | ----- | ------------------------------------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------- |
| [✓]    | MN-01 | Rebuild the docs shell for mobile-first navigation            | H        | —          | Mobile readers see content immediately and can still open the route map                   |
| [✓]    | MN-02 | Add automated shell regression coverage                       | H        | MN-01      | Tests prove the shell exposes the nav trigger, route groups, and current-page context     |
| [✓]    | MN-03 | Reconcile docs guidance and manual evidence for the new shell | H        | MN-02      | Manual built-site exercise exists, plans and traceability are updated, and standards pass |

## Task details

### MN-01 - Rebuild the docs shell for mobile-first navigation

**Goal:** Make the docs readable on a phone without sacrificing route discovery.

**Step-by-step instructions:**

1. Refactor `apps/docs/src/layouts/doc-shell.astro` so the navigation collapses below the mobile breakpoint.
2. Add a compact header or command-bar-style control that opens the docs route list on demand.
3. Ensure the current page label and page summary stay visible when the nav is closed.
4. Adjust spacing, touch target sizes, and sticky behavior for the new shell.
5. Verify the desktop rail still works after the mobile changes.

### MN-02 - Add automated shell regression coverage

**Goal:** Keep the mobile shell from regressing back into the current failure mode.

**Step-by-step instructions:**

1. Add or update tests that assert the docs shell includes the mobile nav control and route groups.
2. Add checks that the homepage still exposes the first content blocks directly in the markup and route structure.
3. Confirm the new shell keeps the required routes available.

### MN-03 - Reconcile docs guidance and manual evidence for the new shell

**Goal:** Close the shell work honestly.

**Step-by-step instructions:**

1. Update the mobile-navigation plan status after implementation is complete.
2. Update traceability entries for `MN-01` through `MN-03`.
3. Manually exercise the built docs site on mobile-sized and desktop-sized viewports and record the exact observations under `specs/manual-runs/MN-03/`.
4. Run `npm run standards`.

## New code

- `apps/docs/src/layouts/doc-shell.astro`: responsive navigation shell with mobile-first behavior.
- `apps/docs/src/lib/nav.ts`: route metadata tweaks needed for the new shell.
- `packages/core/src/docs-release.test.ts` or related docs regression tests: shell and route-visibility coverage.
- `specs/manual-runs/MN-03/*`: manual evidence for the built docs shell.

## Tests

- Add shell regression coverage for the mobile nav trigger and required route groups.
- Verify the docs site still builds and typechecks.
- Run `npm run standards`.

## Review checklist

[✓] Have all outstanding questions been answered?
[✓] Are there any ambiguities that need to resolved?
