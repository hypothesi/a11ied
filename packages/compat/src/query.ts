import {
   getTestCaseBySlug,
   listAriaAtEnvironments,
   listEnvironmentFiles,
   listFeatures,
   listTestCases,
   type FeatureReport,
   type FeatureType,
   type ScreenReaderTestCase,
} from '@a11ied/support-data';
import {
   classifyEnvironmentBrowser,
   classifyEnvironmentPlatform,
   normalizeScreenReaderName,
} from './browserslist.js';
import { normalizeFeatureUsage, resolveFeatureReport } from './normalize.js';
import type {
   EnvironmentQueryFilter,
   FeatureQueryFilter,
   TestCaseOutcomesResult,
   TestCaseQueryFilter,
   UnifiedEnvironment,
} from './types.js';

function collectUnifiedEnvironments(): readonly UnifiedEnvironment[] {
   const unified: UnifiedEnvironment[] = [];

   for (const file of listEnvironmentFiles()) {
      const env = file.environment;
      const browserType = env.browserType === 'webview' ? 'webview' : 'browser';
      const latestRun = file.runs
         .map((run) => run.runAt)
         .toSorted()
         .at(-1);

      unified.push({
         key: file.environmentKey,
         id: env.id,
         source: 'local',
         status: file.status,
         ...(file.statusNote ? { statusNote: file.statusNote } : {}),
         platformGroup: env.platformGroup,
         screenReader: env.screenReader,
         screenReaderFamily: normalizeScreenReaderName(env.screenReader),
         screenReaderVersion: env.screenReaderVersion,
         browser: env.browser,
         browserFamily: classifyEnvironmentBrowser(env.browser, browserType),
         browserVersion: env.browserVersion,
         browserType,
         os: env.os,
         osPlatform: classifyEnvironmentPlatform(env.os),
         osVersion: env.osVersion,
         device: env.device,
         runCount: file.runs.length,
         planCount: 0,
         ...(latestRun ? { latestTestedAt: latestRun } : {}),
      });
   }

   for (const ariaEnv of listAriaAtEnvironments()) {
      unified.push({
         key: ariaEnv.key,
         id: `w3c-aria-at:${ariaEnv.key}`,
         source: 'w3c-aria-at',
         status: 'tested',
         screenReader: ariaEnv.screenReader,
         screenReaderFamily: normalizeScreenReaderName(ariaEnv.screenReader),
         screenReaderVersion: ariaEnv.screenReaderVersion,
         browser: ariaEnv.browser,
         browserFamily: classifyEnvironmentBrowser(ariaEnv.browser, 'browser'),
         browserVersion: ariaEnv.browserVersion,
         browserType: 'browser',
         os: ariaEnv.os,
         osPlatform: classifyEnvironmentPlatform(ariaEnv.os),
         osVersion: ariaEnv.osVersion,
         device: ariaEnv.device,
         runCount: 0,
         planCount: ariaEnv.planCount,
         ...(ariaEnv.latestTestedAt ? { latestTestedAt: ariaEnv.latestTestedAt } : {}),
      });
   }

   return unified;
}

function matchesBrowserFilter(env: UnifiedEnvironment, browserFilter: string): boolean {
   const lower = browserFilter.trim().toLowerCase();
   return env.browserFamily === lower || env.browser.toLowerCase().includes(lower);
}

function matchesOsFilter(env: UnifiedEnvironment, osFilter: string): boolean {
   const lower = osFilter.trim().toLowerCase();
   return env.osPlatform === lower || env.os.toLowerCase().includes(lower);
}

function matchesScreenReaderFilter(env: UnifiedEnvironment, srFilter: string): boolean {
   const normalizedTarget = normalizeScreenReaderName(srFilter).toLowerCase();
   const rawLower = srFilter.trim().toLowerCase();
   return (
      env.screenReaderFamily.toLowerCase() === normalizedTarget ||
      env.screenReader.toLowerCase().includes(rawLower)
   );
}

function matchesVisibilityFilter(
   env: UnifiedEnvironment,
   filter: EnvironmentQueryFilter,
): boolean {
   if (filter.includeWebViews === false && env.browserType === 'webview') {
      return false;
   }
   if (filter.includeVirtual === false && env.platformGroup === 'virtual') {
      return false;
   }
   if (filter.source && env.source !== filter.source) {
      return false;
   }
   if (filter.status && env.status !== filter.status) {
      return false;
   }
   return true;
}

function matchesEnvironmentFilter(
   env: UnifiedEnvironment,
   filter: EnvironmentQueryFilter,
): boolean {
   if (!matchesVisibilityFilter(env, filter)) {
      return false;
   }
   if (filter.browserType && env.browserType !== filter.browserType) {
      return false;
   }
   if (filter.browser && !matchesBrowserFilter(env, filter.browser)) {
      return false;
   }
   if (filter.os && !matchesOsFilter(env, filter.os)) {
      return false;
   }
   if (filter.screenReader && !matchesScreenReaderFilter(env, filter.screenReader)) {
      return false;
   }
   return true;
}

/** Queries tracked screen reader environments across both local runs and W3C ARIA-AT. */
export function queryEnvironments(
   filter?: EnvironmentQueryFilter,
): readonly UnifiedEnvironment[] {
   const all = collectUnifiedEnvironments();
   if (!filter) {
      return all;
   }
   return all.filter((env) => matchesEnvironmentFilter(env, filter));
}

function matchesFeatureSearch(feature: FeatureReport, queryLower: string): boolean {
   const haystack = [
      feature.key,
      feature.title,
      feature.refId,
      feature.linkText,
      ...feature.localCases.map((testCase) => testCase.title),
      ...feature.ariaAtPlans.map((plan) => plan.title),
   ]
      .join(' ')
      .toLowerCase();
   return haystack.includes(queryLower);
}

/** Lists tracked specification features filtered by type, coverage source, or text. */
export function listSupportedFeatures(
   filter?: FeatureQueryFilter,
): readonly FeatureReport[] {
   const all = listFeatures();
   if (!filter) {
      return all;
   }
   const queryLower = filter.search?.trim().toLowerCase();
   return all.filter((feature) => {
      if (filter.type && feature.type !== filter.type) {
         return false;
      }
      if (filter.sourceCoverage && feature.sourceCoverage !== filter.sourceCoverage) {
         return false;
      }
      if (queryLower && !matchesFeatureSearch(feature, queryLower)) {
         return false;
      }
      return true;
   });
}

/**
 * Looks up one feature report by shorthand string (`alert`, `aria:alert`, `@checked`) or
 * descriptor.
 */
export function getFeature(
   query: string | { readonly type?: FeatureType; readonly id: string },
): FeatureReport | undefined {
   if (typeof query === 'string') {
      return resolveFeatureReport(normalizeFeatureUsage(query));
   }
   return resolveFeatureReport(
      normalizeFeatureUsage({
         ...(query.type === undefined ? {} : { type: query.type }),
         feature: query.id,
      }),
   );
}

/** Queries isolated local screen reader test cases. */
export function queryTestCases(
   filter?: TestCaseQueryFilter,
): readonly ScreenReaderTestCase[] {
   const all = listTestCases();
   if (!filter) {
      return all;
   }
   const searchLower = filter.search?.trim().toLowerCase();
   const attrLower = filter.attribute?.trim().toLowerCase();
   const tagLower = filter.tag?.trim().toLowerCase();

   return all.filter((testCase) => {
      if (filter.category && testCase.category !== filter.category) {
         return false;
      }
      if (attrLower && testCase.attribute.toLowerCase() !== attrLower) {
         return false;
      }
      if (tagLower && !testCase.tags.some((tag) => tag.toLowerCase() === tagLower)) {
         return false;
      }
      if (searchLower) {
         const haystack = [
            testCase.slug,
            testCase.title,
            testCase.attribute,
            testCase.summary,
            testCase.expectedBehavior,
            ...testCase.tags,
         ]
            .join(' ')
            .toLowerCase();
         if (!haystack.includes(searchLower)) {
            return false;
         }
      }
      return true;
   });
}

/** Retrieves recorded runs (including verbatim transcripts) for one isolated test case. */
export function getTestCaseOutcomes(
   slug: string,
   filter?: EnvironmentQueryFilter,
): TestCaseOutcomesResult {
   const testCase = getTestCaseBySlug(slug);
   if (!testCase) {
      return { runs: [] };
   }

   const matchedEnvs = new Set(queryEnvironments(filter).map((env) => env.key));
   const runs = listEnvironmentFiles().flatMap((file) => {
      if (filter && !matchedEnvs.has(file.environmentKey)) {
         return [];
      }
      const match = file.runs.find((run) => run.testSlug === slug);
      return match ? [match] : [];
   });

   return {
      testCase,
      runs,
   };
}
