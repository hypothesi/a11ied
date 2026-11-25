# `@a11ied/support-data`

Versioned screen reader and assistive technology compatibility dataset published by
`a11ied`. Includes:

- Isolated specification test cases and RFC 2119 assertions (`listTestCases`,
  `getTestCaseBySlug`, `resolveCaseAssertions`)
- Exact 7-tuple environment test runs recorded with real assistive technologies and
  verbatim speech transcripts (`listEnvironmentFiles`, `listEnvironments`,
  `getRunsForTest`)
- Synchronized W3C ARIA-AT Community Group test plans and finalized environment reports
  (`listAriaAtPlans`, `getAriaAtPlanBySlug`, `listAriaAtEnvironments`, `getAriaAtSummary`)
- Unified per-feature compatibility summaries (`listFeatures`, `getFeatureReport`)
- Zero-Node browser-safe types and helpers via `@a11ied/support-data/types`
