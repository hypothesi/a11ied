# @a11ied/act-conformance

Runs a11ied against the [W3C ACT test cases][cases] and reports any contradiction.
Private to this repo. It is not published.

[cases]: https://www.w3.org/WAI/standards-guidelines/act/report/testcases/

## Commands

```sh
npm run act:corpus            # fetch the pinned test cases
npm run act:conformance       # scan all 1,213 and check against the baseline
```

Both run from the repo root. The run also takes flags:

```sh
npx tsx scripts/run.ts --limit=60 --concurrency=4    # a quick subset
npx tsx scripts/run.ts --video                       # include the 84 MB of video assets
npx tsx scripts/run.ts --update-baseline             # record the current contradictions
```

## What counts as passing

ACT Rules Format 1.1 section 4.14.1 defines the comparison. A contradiction is a test case
whose expected outcome is `passed` or `inapplicable` reported as `failed`, or one whose
expected outcome is `failed` reported as `passed` or `inapplicable`. `cantTell` and
`untested` never contradict, and neither does reporting nothing at all.

The run fails on any contradiction that is not in `baseline.json`, and also fails when a
baselined contradiction disappears, so the file cannot go stale.

The baseline is not a way to ignore results. axe-core's own W3C-accepted report contains
111 contradictions against the current test cases, 90 of them on approved rules, because
an axe rule's scope and an ACT rule's scope are not always the same. ACT rule `09o5cg` is
the AA contrast rule and is claimed by both `color-contrast` and `color-contrast-enhanced`,
so the AAA rule reports failed on the AA rule's passing examples. a11ied cannot change
that. What the baseline does is make a new contradiction fail the build.

## The corpus

`src/corpus.ts` pins `w3c/wcag-act-rules` to a commit and fetches it with a blobless
sparse clone into `.cache/<commit>/`, which is gitignored. A full clone is 105 MB; this
pulls about 11 MB in under two seconds.

`perspective-video/` (71 MB) and `rabbit-video/` (13 MB) are excluded by default. Their
test cases cover ACT rules `eac66b`, `80f0bf`, and `8fc3b6`, which axe does claim, so pass
`--video` before generating a report for submission.

Test cases reference their assets with absolute paths under
`/WAI/content-assets/wcag-act-rules/`, so `src/server.ts` mounts the corpus there. Serving
it from the root leaves 707 asset references returning 404, which changes what axe reports
for the contrast and media rules without any visible error.

## Rule selection

`src/mapping.ts` reads `actIds` from axe-core and scans those rule ids explicitly. It does
not use the criterion-driven default selection, which would miss `empty-heading`: that
rule is tagged `best-practice` with no success criterion, and dropping it would take ACT
rule `ffd0e9` and its 15 test cases with it.

Each `(ACT rule, axe rule)` pair is scored separately. Ten ACT rules are claimed by more
than one axe rule, and folding them into a single verdict lets the stricter sibling
manufacture contradictions against the other's passing examples.

## Why Playwright

axe-core in jsdom memoizes `window` and `document` on the first `axe.run`, so a second
document in the same Node process throws `axe.run arguments are invalid`. The run scans
through Playwright with a pinned 1280x720 viewport, which also keeps the contrast and
focus-visibility rules deterministic.

## License of the test cases

The test cases are published by the W3C under the [W3C Software and Document Notice and
License][license], which `testcases.json` names directly. They are fetched into a
gitignored cache at run time. Nothing from the corpus is committed to this repository or
published to npm.

[license]: https://act-rules.github.io/pages/license/
