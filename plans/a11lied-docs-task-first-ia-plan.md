# a11ied docs task-first information architecture: implementation plan (v0.1.0 - 2026-04-09)

## Summary

Rework the docs entry path so readers can start from jobs like "check a criterion" or "drive a screen reader session" instead of translating their intent into the repo's internal architecture first.

## Objectives & scope

- In scope: homepage structure, route cross-linking, task-first entry points, concise workflow pages or sections, and accuracy updates to supporting docs pages.
- Out of scope: rewriting the whole docs site as a tutorial system or adding account-aware onboarding.

## Assumptions & open questions

- Assumptions: the current docs are accurate but subsystem-first; a developer or agent usually arrives with a task in mind, not a package boundary.
- Open questions: none.

## Requirements

### Functional

- FR-1: The homepage must offer task-first entry points for the primary docs workflows.
- FR-2: The docs must make it obvious how to follow the product ladder: lookup, scope, gather evidence, then verify.
- FR-3: The docs must provide at least one route or major section that groups common workflows rather than only subsystem reference pages.
- FR-4: Supporting pages must cross-link back to the relevant workflow entry points.

### Non-functional

- NFR-1 (Performance): Task-first IA changes must stay static and cheap to render.
- NFR-2 (Accessibility): Workflow sections must remain readable and keyboard navigable.
- NFR-3 (Observability): Tests must prove that task-first routes and links exist.
- NFR-4 (Maintainability): Workflow guidance must stay tied to the shipped CLI and MCP surface, not hand-wavy examples.

## Architecture & design overview

- Keep reference pages, but stop asking the reader to start there.
- Introduce a task-first landing structure on the homepage and one dedicated workflows page if needed.
- Group journeys around operator intent:
   - check one criterion
   - verify a target level
   - drive a reader manually
   - use a11ied from an agent or Storybook
- Use the existing route map as the detailed layer beneath these starting points.

## Task grid

| Status | ID    | Task                                                     | Priority | Depends On | Acceptance Criteria                                                          |
| ------ | ----- | -------------------------------------------------------- | -------- | ---------- | ---------------------------------------------------------------------------- |
| [✓]    | IA-01 | Add task-first entry points and workflow guidance        | H        | —          | Homepage and supporting routes guide readers by task before subsystem        |
| [✓]    | IA-02 | Audit route accuracy and cross-linking                   | H        | IA-01      | Workflow links match the shipped docs routes and current CLI/MCP surface     |
| [✓]    | IA-03 | Reconcile plan status, traceability, and manual evidence | H        | IA-02      | Manual built-site review exists, traceability is updated, and standards pass |

## Task details

### IA-01 - Add task-first entry points and workflow guidance

**Goal:** Let a reader get to value fast.

**Step-by-step instructions:**

1. Rewrite the homepage so the first decisions are task based, not architecture based.
2. Add one workflow-focused route or major page section if the homepage alone is too crowded.
3. Include concrete paths for CLI, MCP, Storybook, and manual-driver use where they fit.
4. Keep the command examples real and aligned with the shipped surface.

### IA-02 - Audit route accuracy and cross-linking

**Goal:** Make the new entry points trustworthy.

**Step-by-step instructions:**

1. Audit all workflow links against the current docs routes and command names.
2. Update supporting pages so they point back to the task-first entry paths where appropriate.
3. Remove or rewrite copy that assumes the reader already knows the repo’s internal layering.
4. Add regression checks for required workflow labels and routes.

### IA-03 - Reconcile plan status, traceability, and manual evidence

**Goal:** Close the IA work without wishful thinking.

**Step-by-step instructions:**

1. Update the IA plan status once the implementation and audits are actually complete.
2. Update the docs UX traceability rows with the automated and manual evidence.
3. Manually exercise the built homepage and workflow routes and record the session under `specs/manual-runs/IA-03/`.
4. Run `npm run standards`.

## New code

- `apps/docs/src/pages/index.astro`: task-first landing structure.
- `apps/docs/src/pages/*.astro`: cross-links and content updates needed by the new IA.
- Optional workflow route under `apps/docs/src/pages/`: grouped onboarding by operator task.
- Docs regression tests and manual-run records tied to the new routes.

## Tests

- Add checks for the task-first entry points and key workflow routes.
- Verify route links still match the shipped docs surface.
- Run `npm run standards`.

## Review checklist

[✓] Have all outstanding questions been answered?
[✓] Are there any ambiguities that need to resolved?
