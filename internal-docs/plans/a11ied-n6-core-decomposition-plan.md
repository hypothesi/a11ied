# Core decomposition: implementation plan (2026-11-09)

Source: `internal-docs/capabilities-review-and-target-design.md` (god-package finding: ~34k LOC in `@a11ied/core`).

## Summary

Split `@a11ied/core` (today `audit`, `driver`, `evidence`, `report`, `axe`, `apg`, `discovery`, `wcag`, `targets`, `tree`, `doctor` plus the SR queued API) into packages with one job each, matching the target architecture: `knowledge`, `observe`, `verdict`, `review`, `report`, `screen-reader`. Every package depends only on `contracts` plus its stated inputs; cycles are banned by construction, not by review.

## Objectives and scope

In scope:

- Package map (below), moves of `core/src/*` directories, dependency wiring, and the `core` shim that re-exports for one release.
- Build/CI (`turbo.json`) updates; publishable boundaries stay as today (`cli` publishes `a11ied`; scoped libraries standalone).

Out of scope:

- Behavior changes inside moved code (pure relocation + import updates).
- New packages beyond the six below.

## Assumptions

- `contracts` remains the single schema home; all packages depend on it only.
- `guidepup` stays the SR adapter package (N4 keeps it); `wcag-data` + `wcag-engine` stay as-is.

## Requirements

- FR-1: Resulting packages: `knowledge` (wcag + apg + relevance), `observe` (axe + tree + browser + discovery + verdict inputs), `verdict` (N1 engine + procedure registry N3 + coordinator queue), `review` (N5 facade + evidence verdict store), `report` (report + earl + sarif views), `screen-reader` (driver + guidepup adapter + queued API).
- FR-2: Dependency DAG has no cycles; `review` depends on `verdict`/`observe`/`screen-reader`, never the reverse.
- FR-3: `@a11ied/core` becomes a shim re-exporting the six packages for one release, then is removed.

## Design

- Move by directory first (no file renames), then split `core/src/index.ts` exports per package. `tsup` configs mirror `wcag-engine`/`guidepup` today.
- The verdict store (N1) and the unified persistence layer (P1-13) live in `review` / a shared `files` location both can depend on without cycles.

## Implementation steps

1. Create the six packages with `package.json` (0.1.0, same deps policy), move directories, fix imports.
2. `core` shim + `turbo` build; run `npm run standards` + `npm test`.
3. Update `cli`/`mcp-server`/docs imports; add the cycle check (madge or tsc project refs) to CI.
4. Release note; remove the shim in the next major.

## Testing

- Build: `turbo run build` green with the new graph.
- No-cycle check enforced in CI.
- Behavior: full test suite unchanged and green.

## Acceptance criteria

- Six single-job packages; no package workspace imports a sibling's internals (deep `src/` paths banned by the gate).
- Standards and tests pass.

## Sequencing

Start with N1/N2 in place (they define `observe`/`verdict` boundaries). Land before N5 lands its facade, or carry the shim through N5.
