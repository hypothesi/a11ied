# Merged skills: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P2-14. Updated 2026-11-09: the merged skill documents the retained, reorganised SR CLI (N4) for both human and agent use.

## Summary

Merge `full-site-audit` and `a11ied` into one skill with two recipes: "check this page" (scan + tree + targeted screen reader steps) and "audit this site" (coordinator). The shared screen reader and evidence chapters are currently duplicated across both skills. The SR CLI is retained (N4): the merged skill teaches the six SR groups (session/navigate/interact/assert/inspect/bulk) once, with an interactive human recipe and an agent/script recipe (batch + `--json` + exit codes).

## Objectives and scope

In scope:

- `packages/skills/a11ied/SKILL.md` becomes the single home; `packages/skills/full-site-audit/SKILL.md` becomes a redirect/alias stub or is removed with a release note.
- One shared screen reader chapter, one shared evidence chapter, two recipes.
- `packages/skills/ai.json`, `openai.yaml` metadata, and docs site (`packages/docs`) skill pages updated.
- Release readiness doc (`internal-docs/releases/v0.1.0-readiness.md`) agent-skill section updated.

Out of scope:

- Changing skill behavior or tooling (content merge only).
- Removing the `resources/` files (they are folded into the merged skill or kept as resources of one package).
- Removing the SR CLI or its verbs. The merged skill is the index for the retained SR surface (N4); it must cover both human interactive use and agent scripting.

## Assumptions

- Hosts resolve skills by the `name` frontmatter field; renaming `full-site-audit` to a recipe inside `a11ied` changes the invocation name and must be announced.
- The 690-line combined size is reducible because the shared chapters overlap by roughly 80 lines.

## Requirements

### Functional

- FR-1: One installed skill answers both "check this page" and "audit this site" without the agent needing to choose a skill first.
- FR-2: The screen reader safety, evidence, and cleanup chapters appear exactly once.
- FR-3: Old skill name `full-site-audit` still resolves (stub pointing to the merged skill) for one release.

### Non-functional

- NFR-1: Merged skill total lines <= 450 (vs 690 today).
- NFR-2: `npm run prose` (vale) and docs build pass.

## Design

- New structure:
   - Frontmatter: `name: a11ied`, description covering both recipes.
   - Recipe A (page): `check` command, `tree`, targeted `sr` steps, assertion pattern.
   - Recipe B (site): coordinator loop, status, finalize, report.
   - Shared chapters: screen reader session, evidence, cleanup, rules.
- `full-site-audit/` keeps `SKILL.md` as a one-page alias with `name: full-site-audit` pointing at the merged flow, removed in the next major.
- `ai.json` lists one canonical skill plus the alias.

## Implementation steps

1. Draft merged `a11ied/SKILL.md` (dedupe shared chapters; keep both recipes).
2. Alias stub for `full-site-audit`.
3. `ai.json`, `openai.yaml`, docs pages, README skill table.
4. Release note + readiness checklist update.

## Testing

- Prose lint (`vale`) on the merged file.
- Docs build; skill loads in a fresh host with a two-recipe checklist task (page check + site status).
- No stale references: grep for `full-site-audit` returns only the alias and historical docs.

## Risks

- Agents with `full-site-audit` cached: the alias handles this.
- Merged file becomes a wall of text: mitigate with recipe headers and a size budget.

## Acceptance criteria

- One skill, two recipes, one shared chapter set.
- Total lines under budget; prose and docs green.

## Sequencing

Land after P1-10 (entry-point names) so recipes use final command names. Independent of code changes. N4's six SR groups must land first so the skill teaches the final grouping.
