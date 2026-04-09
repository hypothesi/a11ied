# a11ied docs UX remediation roadmap: implementation plan (v0.1.0 - 2026-04-09)

## Summary

Fix the docs issues surfaced in the April 9 critique by treating them as five separate workstreams: mobile navigation, task-first information architecture, readability and typography, layout rhythm, and identity refinement. Deliver each slice with implementation, reconciliation, and release-truth work instead of calling it done when the CSS looks better.

## Objectives & scope

- In scope: docs shell and page redesign work inside `apps/docs`, accuracy and content updates for shipped surfaces, automated regression coverage, manual built-site exercise, plan reconciliation, bead tracking, and release-readiness notes for the docs slice.
- Out of scope: changing CLI, MCP, or runtime semantics; adding a docs search backend; replacing Astro; or inventing brand positioning that the product itself does not support.

## Assumptions & open questions

- Assumptions: the docs audience is primarily developers and AI agents using the CLI and MCP surfaces; the desired tone is a technical field manual with some editorial edge, not a product-marketing site.
- Open questions: none.

## Requirements

### Functional

- FR-1: The docs work must be split into separate issue plans for each critique problem, not one catch-all redesign note.
- FR-2: The repo must track each docs issue in Beads with explicit implementation, reconciliation, and release-truth work.
- FR-3: The docs site must end in a state where the built surface matches the actual shipped repo behavior.
- FR-4: Every user-facing docs change must be backed by manual exercise of the built site, not just source inspection.

### Non-functional

- NFR-1 (Performance): The docs shell must not add heavyweight client-side behavior for basic reading and navigation.
- NFR-2 (Security): Docs examples must remain local and executable without adding remote script dependencies beyond approved font loading.
- NFR-3 (Accessibility): The docs must improve mobile usability, text contrast, reading measure, and navigation clarity.
- NFR-4 (Observability): Automated tests, Gherkin traceability, and manual-run records must make the docs work auditable after the fact.
- NFR-5 (Maintainability): The plan and bead structure must make it obvious which issue is being addressed, which evidence is required, and which release gate remains open.

## Architecture & design overview

- Keep Astro pages as the content layer and the shared docs shell as the main layout system.
- Treat the redesign as five coordinated but distinct layers:
   - mobile shell and navigation
   - task-first onboarding and route structure
   - typography, contrast, and reading measure
   - section rhythm and page composition
   - visual identity refinement
- Add one docs UX feature spec and traceability entries so the acceptance story is visible in the same system as the rest of the repo.
- Use one top-level docs UX Beads epic with child epics or tasks per issue plan, plus explicit reconciliation and release-truth beads.

## Task grid

| Status | ID    | Task                                                                  | Priority | Depends On | Acceptance Criteria                                                                                   |
| ------ | ----- | --------------------------------------------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| [✓]    | DX-01 | Create issue-specific docs UX plans and acceptance specs              | H        | —          | Five issue plans plus a shared docs UX acceptance spec exist in the repo                              |
| [✓]    | DX-02 | Track the docs UX work in Beads with reconciliation and release gates | H        | DX-01      | Beads exist for implementation, reconciliation, and release truth with explicit manual evidence types |
| [✓]    | DX-03 | Deliver the five docs UX workstreams                                  | H        | DX-02      | All issue-plan implementation beads are complete with tests, manual evidence, and standards passing   |
| [✓]    | DX-04 | Reconcile plan docs, tracker state, and release notes                 | H        | DX-03      | Plan docs, traceability, manual runs, and public docs surfaces all tell the same story                |

## Task details

### DX-01 - Create issue-specific docs UX plans and acceptance specs

**Goal:** Turn the critique into concrete, reviewable design work instead of vague intent.

**Step-by-step instructions:**

1. Create one plan file for each critique issue under `plans/`.
2. Create one shared docs UX roadmap that explains how the issue plans fit together.
3. Add a Gherkin feature file that covers the docs UX acceptance story.
4. Add initial traceability rows for the new docs UX tasks.
5. Verify the new planning files exist and reference the critique-derived work clearly.

### DX-02 - Track the docs UX work in Beads with reconciliation and release gates

**Goal:** Make the tracker reflect the real work, not just the implementation slice.

**Step-by-step instructions:**

1. Create a top-level Beads epic for the docs UX remediation work.
2. Create child beads for each issue plan.
3. Add separate beads where needed for implementation, reconciliation, public-surface audit, and release truth.
4. Label the required manual evidence type on every bead.
5. Record links back to the relevant plan files, Gherkin feature, traceability rows, and manual-run directories.

### DX-03 - Deliver the five docs UX workstreams

**Goal:** Fix the actual docs experience.

**Step-by-step instructions:**

1. Implement the mobile navigation and shell changes first because they affect every route.
2. Rework the homepage and route structure so first-time readers can start from tasks, not internals.
3. Tighten typography, contrast, and reading measure across the site.
4. Break the repeated panel pattern and introduce more deliberate page rhythm.
5. Refine the visual identity so the docs feel more distinct and less like an AI-default type pairing in nicer clothes.
6. Update content anywhere the new structure makes the old copy stale or redundant.

### DX-04 - Reconcile plan docs, tracker state, and release notes

**Goal:** End with one honest story across code, plans, tracker, and release notes.

**Step-by-step instructions:**

1. Update the docs UX plan files to reflect actual completion state.
2. Update traceability and manual-run evidence for every completed bead.
3. Audit the docs site for placeholder language, stale guidance, or routes that no longer match the product surface.
4. Add or update release-readiness notes for any real blockers or deferred work.
5. Run `npm run standards`.
6. Manually exercise the built docs site and record the final review under `specs/manual-runs/`.

## New code

- `plans/a11ied-docs-ux-remediation-roadmap.md`: top-level roadmap for the docs UX remediation work.
- `plans/a11ied-docs-*.md`: one plan file per critique issue.
- `specs/gherkin/15-docs-ux-remediation.feature`: acceptance coverage for the docs UX workstream.
- `apps/docs/src/layouts/doc-shell.astro` and `apps/docs/src/pages/*.astro`: layout and content changes required by the issue plans.
- `packages/core/src/docs-release.test.ts` or adjacent docs regression tests: automated checks for the updated docs structure and honesty rules.

## Tests

- Add regression checks for the new docs structure, route map, and content guardrails.
- Add acceptance traceability for the docs UX feature file.
- Run `npm run standards`.
- Manually exercise the built docs site and record the exact surface reviewed.

## Review checklist

[✓] Have all outstanding questions been answered?
[✓] Are there any ambiguities that need to resolved?
