# @a11ied/support-data

## 0.1.0

First release.

- Isolated test cases for ARIA roles, attributes, and HTML elements, each with RFC 2119
  assertions (`listTestCases`, `getTestCaseBySlug`, `resolveCaseAssertions`).
- Test runs recorded with real screen readers and the simulated reader, keyed by screen
  reader, browser, and operating system version, with the speech transcript of each run
  (`listEnvironments`, `getRunsForTest`, `getRunForTestAndEnvironment`).
- W3C ARIA-AT test plans and their published results (`listAriaAtPlans`,
  `getAriaAtPlanBySlug`, `getAriaAtSummary`).
