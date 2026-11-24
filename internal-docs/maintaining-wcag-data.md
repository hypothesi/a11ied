# Maintaining the WCAG data

This is for maintainers of the repository. It is not part of the docs site, because
nothing in normal use of a11ied fetches or regenerates data. The site's
[WCAG data](../packages/docs/src/pages/reference/wcag-data.astro) page describes the
data for people who use it.

## Refresh the data

From the repository root:

```sh
npm run wcag:sync
npm run wcag:validate
```

`wcag:sync` downloads the sources and regenerates the files. `wcag:validate` checks them
against the recorded sources. Review the diff before you commit it.

The [README](../README.md#standards-data-workflow) lists the checks to run afterwards.

## The data files

The files are in the `@a11ied/wcag-data` package, one set per WCAG version. Code outside
the package reads them through the API or the CLI. The file layout can change between
releases.

- `criteria`, `criteria-by-level`, `slug-index`: the criterion records, and indexes by
  level and by slug.
- `test-methods`, `test-method-summary`, `strategy`: the test method of each criterion,
  the counts per level, and the testing strategy.
- `technique-index`, `failure-index`, `technique-bodies`: techniques and failures, with
  their titles, the criteria that list them, and their text.
- `axe-rules`, `act-rules`: each rule and the criteria it maps to.
- `understanding`, `documents-content`: the Understanding documents, converted to
  Markdown.
- `apg-patterns`, `mobile-guidance`: the ARIA patterns and the mobile guidance. One file
  each, for both versions.
