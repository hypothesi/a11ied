# a11ied docs readability and typography: implementation plan (v0.1.0 - 2026-04-09)

## Summary

Improve reading comfort and hierarchy across the docs by tightening line length, increasing contrast where the current muted tones get too quiet, and replacing the current type system with something less predictable and more durable.

## Objectives & scope

- In scope: font choices, type scale, heading hierarchy, reading measure, body copy contrast, code block readability, and supporting docs copy edits where the old layout encouraged overlong passages.
- Out of scope: generated API docs, localization, or changing the technical substance of the docs.

## Assumptions & open questions

- Assumptions: the existing Fraunces plus IBM Plex pairing is too recognizable as a design-aware AI reflex; the current body measure and muted text leave some pages harder to read than they need to be.
- Open questions: none.

## Requirements

### Functional

- FR-1: Body text must stay within a readable measure on desktop and mobile.
- FR-2: Secondary text and navigation text must use stronger contrast than the current muted treatment where needed.
- FR-3: The docs must use a clearer type hierarchy that works in the shell and in long-form content.
- FR-4: The code and command examples must remain easy to scan.

### Non-functional

- NFR-1 (Accessibility): Text contrast and sizing must support sustained reading and zoomed layouts.
- NFR-2 (Performance): Typography changes must keep font loading reasonable.
- NFR-3 (Observability): Regression checks must prove the site keeps the intended route labels and key content markers after copy tightening.
- NFR-4 (Maintainability): Type tokens and content width rules should live in the shared shell, not page-by-page drift.

## Architecture & design overview

- Replace the current reflex font pairing with a more distinctive but still readable combination suited to a technical manual.
- Move reading-measure and prose-width rules into the shared shell.
- Tighten the color system so muted text is still legible and dark surfaces breathe better.
- Adjust page summaries and long paragraphs where the new measure reveals unnecessary sprawl.

## Task grid

| Status | ID    | Task                                                                      | Priority | Depends On | Acceptance Criteria                                                              |
| ------ | ----- | ------------------------------------------------------------------------- | -------- | ---------- | -------------------------------------------------------------------------------- |
| [✓]    | RT-01 | Replace the docs type system and reading-measure rules                    | H        | —          | The shared shell uses a stronger type hierarchy and readable line lengths        |
| [✓]    | RT-02 | Tighten contrast and long-form copy where the old styling hid the problem | H        | RT-01      | Body text, nav text, and code surfaces read cleanly across the site              |
| [✓]    | RT-03 | Reconcile tests, traceability, and manual built-site review               | H        | RT-02      | Automated evidence, manual review, and standards all line up with the final site |

## Task details

### RT-01 - Replace the docs type system and reading-measure rules

**Goal:** Make the site easier to read and less obviously assembled from familiar AI-era defaults.

**Step-by-step instructions:**

1. Update the shared docs shell with a new font pairing and type scale.
2. Add explicit reading-measure rules for summaries, body copy, and route lists.
3. Adjust heading hierarchy so page titles, section titles, labels, and meta text separate cleanly.
4. Check code and preformatted blocks after the typography change.

### RT-02 - Tighten contrast and long-form copy where the old styling hid the problem

**Goal:** Fix what the live critique surfaced, not just the font files.

**Step-by-step instructions:**

1. Increase contrast for navigation text, summaries, labels, and secondary copy where the current palette is too faint.
2. Tighten or split paragraphs that become unwieldy under the new reading measure.
3. Recheck dark-surface callouts and code blocks so they remain legible.
4. Add or update regression checks for the docs content markers that the new copy must still contain.

### RT-03 - Reconcile tests, traceability, and manual built-site review

**Goal:** Close the readability work with evidence.

**Step-by-step instructions:**

1. Update the plan status and traceability rows after the typography pass is complete.
2. Manually review the built docs site for reading comfort on desktop and mobile and record the session under `internal-docs/specs/manual-runs/RT-03/`.
3. Run `npm run standards`.

## New code

- `packages/docs/src/layouts/doc-shell.astro`: shared type, color, and measure system.
- `packages/docs/src/pages/*.astro`: copy trims or content grouping changes required by the new measure.
- Docs regression tests and manual-run evidence for the typography pass.

## Tests

- Add or update regression checks for required docs content after copy tightening.
- Verify build and typecheck still pass for the docs app.
- Run `npm run standards`.

## Review checklist

[✓] Have all outstanding questions been answered?
[✓] Are there any ambiguities that need to resolved?
