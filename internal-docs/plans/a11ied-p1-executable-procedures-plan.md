# Executable procedure actions: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P1-7.

## Summary

Rewrite procedure `actions` as tool-call templates. Each action names the MCP/CLI call, its parameters, and the expected artifact content, so the agent fills parameters instead of inventing methods. Add a content example per evidence kind per procedure family in `run-state-and-decisions.md`.

## Objectives and scope

In scope:

- Schema: extend `assessmentProcedureSchema` (`contracts/src/schemas/assessment.ts`) with structured `toolCalls` per action (tool name, input template, expected evidence kind).
- Regenerate the 55 curated procedures (`wcag-data/data/curated/desktop-procedures.json` + `procedures.ts`) with templates.
- Coordinator `next` response: include the templates for the claimed procedure.
- Skill resource: evidence-kind content examples.

Out of scope:

- Auto-executing the templates (the agent still runs them).
- Changing pass/fail criteria text beyond adding the templates.

## Assumptions

- Every current action maps to one of: `tree`, `run_axe`, `audit` (single-page), `sr_action`, `sr_session`, `pattern_check`, or a documented manual observation with a named artifact.
- Templates are versioned with `procedureVersion`; old evidence is not re-validated against new templates.

## Requirements

### Functional

- FR-1: Each procedure's `actions` array entries gain `{ text, toolCalls: [{ tool, input, expect }] }` (text kept for human readers).
- FR-2: `next` returns the templates verbatim for the claimed check.
- FR-3: `run-state-and-decisions.md` gains one worked example per evidence kind (`observation`, `action-trace`, `screenshot`, `speech`, `media`, `measurement`) for each of the 9 procedure families.
- FR-4: Validation (P1-8) may optionally check template presence; it must not reject otherwise-valid evidence.

### Non-functional

- NFR-1: Templates must use only existing MCP/CLI tools (no new surface).
- NFR-2: Regenerated `strategy.2.2.json` diff must be reviewable (only added `toolCalls`, no criterion text changes).

## Design

- Contracts: `procedureToolCallSchema` (tool enum, `input` record, `expect` evidence kinds). `assessmentProcedureSchema` gains `toolCalls` per action; keep `actions: string[]` for backward compatibility.
- Data: `procedures.ts` `seedSchema` gains optional `toolCalls`; curated JSON updated per criterion (55 entries, batched by family).
- Response: `assessment-command.ts` includes `procedure.toolCalls` in `next`.
- Skill: replace generic "Perform the actual procedure" with "Run the templates in order".

## Implementation steps

1. Contracts: schema + `procedure-catalog.ts` passthrough.
2. Curated procedures: draft templates per family (structure, media, content, visual, measurement, keyboard, form, pointer, markup); reviewer checks each against the normative text.
3. Regenerate strategy artifacts; commit diff.
4. `next` response + skill resource examples.
5. Docs: procedure authoring guide (`internal-docs/plans/a11ied-foundation-and-wcag-data-plan.md` pointer).

## Testing

- Unit: schema round-trip; `next` includes templates for every claimed procedure.
- Content: each template's tool name resolves to a registered MCP tool or CLI subcommand (registry-parity test extended).
- Manual: pick 5 criteria across families; an agent with only the template (no prior skill reading) completes the check.

## Risks

- Templates may encode wrong steps: mitigate with per-family review and the worked examples.
- Template drift when tools change: mitigate with the registry-parity test failing if a template names a missing tool.

## Acceptance criteria

- Every A/AA procedure has at least one tool-call template.
- Evidence-kind examples exist for all families.
- Standards and tests pass.

## Sequencing

Depends on P1-10 (entry-point names) for the tool names used. Independent of coordinator changes.
