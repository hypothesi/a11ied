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

- `mobile-guidance.json` should keep an entry for every criterion WCAG2Mobile covers; entries move from `placeholder` to `guidance` as the task force writes them, never back
- `apg-patterns.json` should keep 28 patterns and 68 examples, and 8 of those examples have no tables because the APG documents the landmarks with prose alone
- raw inputs should change only under `packages/wcag-data/data/raw/`
- committed normalized artifacts should change only under `packages/wcag-data/data/generated/`
- `generated-provenance.json` should point back to the approved WCAG, ACT, Quickref, APG, and `axe-core` sources
- regression fixtures and tests should still agree on representative criteria like `1.3.1`, `2.4.3`, `3.3.8`, and `4.1.3`

## notes

- Raw synced inputs are committed under `packages/wcag-data/data/raw/` and should only change when re-running the data sync scripts.
- Generated artifacts are intentionally not ignored, because later normalization output and provenance manifests are meant to be committed.
- The generated layer currently emits:
   - `criteria.<version>.json`
   - `criteria-by-level.<version>.json`
   - `test-methods.<version>.json`
   - `strategy.<version>.json`
   - `test-method-summary.<version>.json`
   - `slug-index.<version>.json`
   - `technique-index.<version>.json`
   - `failure-index.<version>.json`
   - `axe-rules.<version>.json`
   - `act-rules.<version>.json`
   - `understanding.<version>.json`
   - `technique-bodies.<version>.json`
   - `documents-content.json`
   - `mobile-guidance.json`
   - `apg-patterns.json`
   - `generated-provenance.json`
- `data/generated/` ships in the published package next to `dist/`; `@a11ied/wcag-engine` reads it from there.
- Techniques carry a `url` to the W3C technique page and criteria carry `understandingUrl`. The Understanding document and the technique body are also copied into the data, converted from HTML to Markdown, under `understanding.<version>.json` and `technique-bodies.<version>.json`. The W3C Document License permits this conversion to help implementation. See `NOTICE.md`.
- `npm run wcag:sync` fetches the Understanding documents and technique bodies with a separate step (`syncDocumentArtifacts`) that runs after the main sync, at low concurrency and with a pause between requests, and merges its results onto whatever is already committed so an incomplete run only adds to the corpus.
- A third step (`syncMobileGuidance`) fetches WCAG2Mobile's per-criterion guidance from the `w3c/matf` source files and writes `mobile-guidance.json`. It requests every Level A and AA criterion across both pinned WCAG versions and treats a 404 as "the document does not cover this criterion". The file is not version-scoped, because WCAG2Mobile applies WCAG 2.2 to mobile and criterion ids are stable across 2.1 and 2.2. See `NOTICE.md`.
- A fourth step (`syncApgPatterns`) fetches the ARIA Authoring Practices Guide's example index, its pattern index, and every example source file, and writes the keyboard support tables and the role, property, state, and tabindex tables to `apg-patterns.json`. That is 70 requests. The file is not version-scoped either: the APG describes ARIA patterns, which do not change between WCAG 2.1 and 2.2. The guide is published under the W3C Software and Document License rather than the W3C Document License. See `NOTICE.md`.
