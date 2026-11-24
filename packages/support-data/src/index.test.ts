import { describe, expect, it } from 'vitest';
import {
   buildEnvironmentKey,
   getAriaAtPlanBySlug,
   getAriaAtSummary,
   getFeatureReport,
   getRunsForTest,
   getTestCaseBySlug,
   listAriaAtPlans,
   listEnvironmentFiles,
   listFeatures,
   listTestCases,
   resetSupportDataCache,
   resolveCaseAssertions,
} from './index.js';

const EXPECTED_CASE_COUNT = 27;
const EXPECTED_ENV_COUNT = 10;
const EXPECTED_TESTED_ENV_COUNT = 7;
const EXPECTED_PLAN_COUNT = 27;
const EXPECTED_ARIA_AT_REPORT_COUNT = 110;

describe('@a11ied/support-data', () => {
   it('loads all isolated test cases with unique slugs and resolved RFC 2119 assertions', () => {
      const cases = listTestCases();
      const slugs = new Set(cases.map((item) => item.slug));

      expect(cases.length).toBe(EXPECTED_CASE_COUNT);
      expect(slugs.size).toBe(cases.length);

      const labelledby = getTestCaseBySlug('aria-labelledby-single-id');
      expect(labelledby).toBeDefined();
      expect(labelledby?.attribute).toBe('aria-labelledby');

      const assertions = labelledby ? resolveCaseAssertions(labelledby) : [];
      expect(assertions.some((item) => item.priority === 'MUST')).toBe(true);
   });

   it('loads local environment files and builds canonical 7-tuple keys', () => {
      const envFiles = listEnvironmentFiles();
      const tested = envFiles.filter((file) => file.status === 'tested');

      expect(envFiles.length).toBe(EXPECTED_ENV_COUNT);
      expect(tested.length).toBe(EXPECTED_TESTED_ENV_COUNT);

      for (const envFile of envFiles) {
         expect(buildEnvironmentKey(envFile.environment)).toBe(envFile.environmentKey);
      }

      const alertRuns = getRunsForTest('role-alert-dynamic');
      expect(alertRuns.length).toBe(EXPECTED_TESTED_ENV_COUNT);
   });

   it('loads synchronized W3C ARIA-AT plans and summary metadata', () => {
      const summary = getAriaAtSummary();
      const plans = listAriaAtPlans();

      expect(summary.plansCount).toBe(EXPECTED_PLAN_COUNT);
      expect(summary.reportsCount).toBe(EXPECTED_ARIA_AT_REPORT_COUNT);
      expect(plans.length).toBe(EXPECTED_PLAN_COUNT);
      expect(getAriaAtPlanBySlug('apg-alert')).toBeDefined();
   });

   it('unifies local and W3C ARIA-AT data per feature and reloads cleanly after reset', () => {
      const features = listFeatures();
      const alertFeature = getFeatureReport('aria', 'alert');
      const hiddenFeature = getFeatureReport('aria', 'aria-hidden');
      const checkedFeature = getFeatureReport('html', '@checked');

      expect(features.length).toBeGreaterThan(EXPECTED_PLAN_COUNT);
      expect(alertFeature?.sourceCoverage).toBe('both');
      expect(hiddenFeature?.sourceCoverage).toBe('local');
      expect(checkedFeature?.sourceCoverage).toBe('w3c-aria-at');

      resetSupportDataCache();
      expect(listFeatures().length).toBe(features.length);
   });
});
