# @a11ied/wcag-data

`@a11ied/wcag-data` is the pinned local data workspace for WCAG source sync and normalized artifact generation.

This package is responsible for:

- keeping raw upstream sync inputs under `data/raw/`
- keeping committed generated artifacts under `data/generated/`
- emitting a committed `generated-provenance.json` manifest for the normalized outputs
- exposing the shared package paths that later sync and engine code will use

Current scaffold commands:

```sh
npm run sync --workspace @a11ied/wcag-data
npm run validate --workspace @a11ied/wcag-data
```

Repository-wide quality gate:

```sh
npm run standards
```

## update workflow

Use this package from the repo root. The boring path is the right path:

```sh
npm run wcag:sync
npm run wcag:validate
npm run standards
```

If you only want the workspace-local form, these are the equivalent commands:

```sh
npm run sync --workspace @a11ied/wcag-data
npm run validate --workspace @a11ied/wcag-data
npm run standards
```

What to review after a sync:

- raw inputs should change only under `packages/wcag-data/data/raw/`
- committed normalized artifacts should change only under `packages/wcag-data/data/generated/`
- `generated-provenance.json` should point back to the approved WCAG, ACT, Quickref, and `axe-core` sources
- regression fixtures and tests should still agree on representative criteria like `1.3.1`, `2.4.3`, `3.3.8`, and `4.1.3`

## notes

- Raw synced inputs are committed under `packages/wcag-data/data/raw/` and should only change when re-running the data sync scripts.
- Generated artifacts are intentionally not ignored, because later normalization output and provenance manifests are meant to be committed.
- The generated layer currently emits:
   - `criteria.<version>.json`
   - `criteria-by-level.<version>.json`
   - `coverage.<version>.json`
   - `strategy.<version>.json`
   - `coverage-summary.<version>.json`
   - `slug-index.<version>.json`
   - `technique-index.<version>.json`
   - `failure-index.<version>.json`
   - `axe-rules.<version>.json`
   - `generated-provenance.json`
- `data/generated/` ships in the published package next to `dist/`; `@a11ied/wcag-engine` reads it from there.
- Techniques carry a `url` to the W3C technique page and criteria carry `understandingUrl`. The Understanding prose and technique bodies are not copied into the data: the `w3c/wcag` repository is under the W3C Document License, which does not grant a general right to redistribute derivative text. See `NOTICE.md`.
