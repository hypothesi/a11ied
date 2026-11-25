# @a11ied/compat

## 0.1.1

No changes in this release.

## 0.1.0

First release.

- `checkCompatibility` takes a Browserslist query and a list of ARIA roles, attributes,
  and elements a project uses, and reports diagnostics for each one that fails a
  requirement on a screen reader the query covers. Each diagnostic names the exact
  screen reader, browser, and operating system versions it was tested on.
- `checkFeatureSupport` answers the same question for one feature.
- `listSupportedFeatures`, `getFeature`, `queryTestCases`, `queryEnvironments`, and
  `getTestCaseOutcomes` query the recorded results directly.
- Browserslist queries map to screen reader and browser pairs through
  `resolveBrowserslistTargets`.
