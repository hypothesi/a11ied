import { getAriaAtSummary, listAriaAtPlans } from './aria-at/index.js';
import type {
   AriaAtCommandResult,
   AriaAtEnvironmentReport,
   AriaAtPlanFile,
} from './aria-at/types.js';
import { screenReaderTests } from './cases/index.js';
import { listEnvironmentFiles } from './results/index.js';
import {
   createEmptyPriorityCounts,
   summarizeAssertions,
   type AssertionResultRecord,
   type AssertionSummary,
   type FeatureType,
   type ScreenReaderTestCase,
   type SideEffectRecord,
   type TestOutcome,
   type TranscriptEntry,
} from './types.js';

export interface LocalFeatureDrilldownItem {
   readonly kind: 'local';
   readonly testSlug: string;
   readonly testTitle: string;
   readonly outcome: TestOutcome;
   readonly keyAnnouncement: string;
   readonly notes: string;
   readonly summary: AssertionSummary;
   readonly assertions: readonly AssertionResultRecord[];
   readonly transcript: readonly TranscriptEntry[];
   readonly driver: string;
   readonly runAt: string;
}

export interface AriaAtFeatureDrilldownItem {
   readonly kind: 'w3c-aria-at';
   readonly planSlug: string;
   readonly planTitle: string;
   readonly planVersionString: string;
   readonly planPhase: string;
   readonly reportID: string;
   readonly upstreamReportURL: string;
   readonly testTitle: string;
   readonly commandResults: readonly AriaAtCommandResult[];
}

export type FeatureDrilldownItem = LocalFeatureDrilldownItem | AriaAtFeatureDrilldownItem;

export interface FeatureEnvironmentResult {
   readonly source: 'local' | 'w3c-aria-at';
   readonly environmentKey: string;
   readonly environmentID: string;
   readonly screenReader: string;
   readonly screenReaderVersion: string;
   readonly browser: string;
   readonly browserVersion: string;
   readonly browserType: 'browser' | 'webview';
   readonly os: string;
   readonly osVersion: string;
   readonly device: string;
   readonly testedAt?: string;
   readonly status: 'tested' | 'untested';
   readonly statusNote?: string;
   readonly summary: AssertionSummary;
   readonly items: readonly FeatureDrilldownItem[];
}

export interface FeatureReport {
   readonly key: string;
   readonly type: FeatureType;
   readonly refId: string;
   readonly title: string;
   readonly linkText: string;
   readonly specURL: string;
   readonly sourceCoverage: 'both' | 'local' | 'w3c-aria-at';
   readonly localCases: readonly ScreenReaderTestCase[];
   readonly ariaAtPlans: readonly AriaAtPlanFile[];
   readonly versionedEnvironments: readonly FeatureEnvironmentResult[];
   readonly testedEnvironmentCount: number;
   readonly localEnvironmentCount: number;
   readonly ariaAtEnvironmentCount: number;
}

interface FeatureMetadata {
   readonly type: FeatureType;
   readonly refId: string;
   linkText: string;
   specURL: string;
   readonly localCases: ScreenReaderTestCase[];
   readonly planMap: Map<string, AriaAtPlanFile>;
}

interface LocalRunMatch {
   readonly testCase: ScreenReaderTestCase;
   readonly runAt: string;
   readonly driver: string;
   readonly outcome: TestOutcome;
   readonly keyAnnouncement: string;
   readonly notes: string;
   readonly transcript: readonly TranscriptEntry[];
   readonly assertionResults?: readonly AssertionResultRecord[];
   readonly assertionSummary?: AssertionSummary;
}

interface AriaAtGroupedBucket {
   readonly report: AriaAtEnvironmentReport;
   readonly assertions: AssertionResultRecord[];
   readonly sideEffects: SideEffectRecord[];
   readonly items: AriaAtFeatureDrilldownItem[];
   latestAt?: string;
}

const COVERAGE_SORT_ORDER: Readonly<Record<FeatureReport['sourceCoverage'], number>> = {
   both: 0,
   local: 1,
   'w3c-aria-at': 2,
};

const EMPTY_SUMMARY: AssertionSummary = {
   must: createEmptyPriorityCounts(),
   should: createEmptyPriorityCounts(),
   may: createEmptyPriorityCounts(),
   severeSideEffects: 0,
   moderateSideEffects: 0,
};

function matchesFeatureAssertion(
   assertion: AssertionResultRecord,
   type: FeatureType,
   refId: string,
): boolean {
   if (assertion.featureRefs && assertion.featureRefs.length > 0) {
      return assertion.featureRefs.some(
         (ref) => ref.type === type && ref.refId === refId,
      );
   }
   return assertion.featureType === type && assertion.featureRef === refId;
}

function buildLocalEnvironmentResult(
   envFile: ReturnType<typeof listEnvironmentFiles>[number],
   runs: readonly LocalRunMatch[],
): FeatureEnvironmentResult {
   const env = envFile.environment;
   const allAssertions: AssertionResultRecord[] = [];
   const items: LocalFeatureDrilldownItem[] = [];
   let latestRunAt: string | undefined = undefined;

   for (const item of runs) {
      const assertions = item.assertionResults ?? [];
      const summary = item.assertionSummary ?? summarizeAssertions(assertions);
      allAssertions.push(...assertions);
      if (!latestRunAt || item.runAt > latestRunAt) {
         latestRunAt = item.runAt;
      }
      items.push({
         kind: 'local',
         testSlug: item.testCase.slug,
         testTitle: item.testCase.title,
         outcome: item.outcome,
         keyAnnouncement: item.keyAnnouncement,
         notes: item.notes,
         summary,
         assertions,
         transcript: item.transcript,
         driver: item.driver,
         runAt: item.runAt,
      });
   }

   return {
      source: 'local',
      environmentKey: envFile.environmentKey,
      environmentID: env.id,
      screenReader: env.screenReader,
      screenReaderVersion: env.screenReaderVersion,
      browser: env.browser,
      browserVersion: env.browserVersion,
      browserType: env.browserType === 'webview' ? 'webview' : 'browser',
      os: env.os,
      osVersion: env.osVersion,
      device: env.device,
      ...(latestRunAt ? { testedAt: latestRunAt } : {}),
      status: envFile.status,
      ...(envFile.statusNote ? { statusNote: envFile.statusNote } : {}),
      summary: runs.length > 0 ? summarizeAssertions(allAssertions) : EMPTY_SUMMARY,
      items,
   };
}

function buildAriaAtEnvKey(report: AriaAtEnvironmentReport): string {
   return [
      report.device,
      report.os,
      report.osVersion,
      report.browserName,
      report.browserVersion,
      report.atName,
      report.atVersion,
   ].join(' | ');
}

interface FeatureDescriptor {
   readonly type: FeatureType;
   readonly refId: string;
   readonly linkText: string;
   readonly specURL: string;
}

function ensureFeatureMetadata(
   metaMap: Map<string, FeatureMetadata>,
   descriptor: FeatureDescriptor,
): FeatureMetadata {
   const key = `${descriptor.type}:${descriptor.refId}`;
   let entry = metaMap.get(key);
   if (!entry) {
      entry = {
         type: descriptor.type,
         refId: descriptor.refId,
         linkText: descriptor.linkText,
         specURL: descriptor.specURL,
         localCases: [],
         planMap: new Map<string, AriaAtPlanFile>(),
      };
      metaMap.set(key, entry);
      return entry;
   }
   if (!entry.specURL && descriptor.specURL) {
      entry.specURL = descriptor.specURL;
   }
   if (entry.linkText === descriptor.refId && descriptor.linkText) {
      entry.linkText = descriptor.linkText;
   }
   return entry;
}

function collectFeatureMetadata(): Map<string, FeatureMetadata> {
   const summaryFile = getAriaAtSummary();
   const plans = listAriaAtPlans();
   const metaMap = new Map<string, FeatureMetadata>();

   for (const feat of summaryFile.features) {
      ensureFeatureMetadata(metaMap, feat);
   }

   for (const plan of plans) {
      for (const ref of plan.featureRefs) {
         const entry = ensureFeatureMetadata(metaMap, ref);
         entry.planMap.set(plan.slug, plan);
      }
   }

   for (const testCase of screenReaderTests) {
      const specURL = testCase.specReferences[0]?.url ?? '';
      const entry = ensureFeatureMetadata(metaMap, {
         type: testCase.category,
         refId: testCase.attribute,
         linkText: `${testCase.attribute} Specification`,
         specURL,
      });
      entry.localCases.push(testCase);
   }

   return metaMap;
}

function appendLocalEnvsForFeature(
   localCases: readonly ScreenReaderTestCase[],
   envFiles: ReturnType<typeof listEnvironmentFiles>,
   versionedEnvs: FeatureEnvironmentResult[],
): void {
   if (localCases.length === 0) {
      return;
   }
   const caseBySlug = new Map(localCases.map((testCase) => [testCase.slug, testCase]));

   for (const envFile of envFiles) {
      const matchedRuns: LocalRunMatch[] = [];
      for (const run of envFile.runs) {
         const testCase = caseBySlug.get(run.testSlug);
         if (!testCase) {
            continue;
         }
         matchedRuns.push({
            testCase,
            runAt: run.runAt,
            driver: run.driver,
            outcome: run.outcome,
            keyAnnouncement: run.keyAnnouncement,
            notes: run.notes,
            transcript: run.transcript,
            ...(run.assertionResults ? { assertionResults: run.assertionResults } : {}),
            ...(run.assertionSummary ? { assertionSummary: run.assertionSummary } : {}),
         });
      }

      versionedEnvs.push(buildLocalEnvironmentResult(envFile, matchedRuns));
   }
}

function extractMatchingTestCommands(
   report: AriaAtEnvironmentReport,
   type: FeatureType,
   refId: string,
): {
   readonly matchingTests: readonly {
      readonly testTitle: string;
      readonly commandResults: readonly AriaAtCommandResult[];
   }[];
   readonly repAssertions: readonly AssertionResultRecord[];
   readonly repSideEffects: readonly SideEffectRecord[];
} {
   const matchingTests: {
      readonly testTitle: string;
      readonly commandResults: readonly AriaAtCommandResult[];
   }[] = [];
   const repAssertions: AssertionResultRecord[] = [];
   const repSideEffects: SideEffectRecord[] = [];

   for (const testItem of report.tests) {
      const filteredCmds: AriaAtCommandResult[] = [];
      for (const cmdRes of testItem.commandResults) {
         const matchingAssertions = cmdRes.assertions.filter((assertion) =>
            matchesFeatureAssertion(assertion, type, refId),
         );
         if (matchingAssertions.length > 0) {
            repAssertions.push(...matchingAssertions);
            repSideEffects.push(...cmdRes.negativeSideEffects);
            filteredCmds.push({
               commands: cmdRes.commands,
               output: cmdRes.output,
               untestable: cmdRes.untestable,
               assertions: matchingAssertions,
               negativeSideEffects: cmdRes.negativeSideEffects,
            });
         }
      }
      if (filteredCmds.length > 0) {
         matchingTests.push({
            testTitle: testItem.testTitle,
            commandResults: filteredCmds,
         });
      }
   }

   return { matchingTests, repAssertions, repSideEffects };
}

interface MergePlanReportOptions {
   readonly plan: AriaAtPlanFile;
   readonly report: AriaAtEnvironmentReport;
   readonly meta: FeatureMetadata;
   readonly grouped: Map<string, AriaAtGroupedBucket>;
}

function mergePlanReportIntoGrouped({
   plan,
   report,
   meta,
   grouped,
}: MergePlanReportOptions): void {
   const extracted = extractMatchingTestCommands(report, meta.type, meta.refId);
   if (extracted.matchingTests.length === 0) {
      return;
   }

   const envKey = buildAriaAtEnvKey(report);
   let group = grouped.get(envKey);
   if (!group) {
      group = {
         report,
         assertions: [],
         sideEffects: [],
         items: [],
         ...(report.markedFinalAt ? { latestAt: report.markedFinalAt } : {}),
      };
      grouped.set(envKey, group);
   }

   if (
      report.markedFinalAt &&
      (!group.latestAt || report.markedFinalAt > group.latestAt)
   ) {
      group.latestAt = report.markedFinalAt;
   }

   group.assertions.push(...extracted.repAssertions);
   group.sideEffects.push(...extracted.repSideEffects);

   for (const matchTest of extracted.matchingTests) {
      group.items.push({
         kind: 'w3c-aria-at',
         planSlug: plan.slug,
         planTitle: plan.title,
         planVersionString: plan.versionString,
         planPhase: plan.phase,
         reportID: report.reportID,
         upstreamReportURL: `https://aria-at.w3.org/report/${plan.planVersionID}/targets/${report.reportID}`,
         testTitle: matchTest.testTitle,
         commandResults: matchTest.commandResults,
      });
   }
}

function collectAriaAtGroupsForFeature(
   meta: FeatureMetadata,
): Map<string, AriaAtGroupedBucket> {
   const grouped = new Map<string, AriaAtGroupedBucket>();
   for (const plan of meta.planMap.values()) {
      for (const report of plan.reports) {
         mergePlanReportIntoGrouped({ plan, report, meta, grouped });
      }
   }
   return grouped;
}

function appendAriaAtEnvsFromGroups(
   grouped: Map<string, AriaAtGroupedBucket>,
   versionedEnvs: FeatureEnvironmentResult[],
): void {
   for (const [envKey, group] of grouped.entries()) {
      const rep = group.report;
      versionedEnvs.push({
         source: 'w3c-aria-at',
         environmentKey: envKey,
         environmentID: `aria-at-${rep.atKey}-${rep.browserKey}-${rep.reportID}`,
         screenReader: rep.atName,
         screenReaderVersion: rep.atVersion,
         browser: rep.browserName,
         browserVersion: rep.browserVersion,
         browserType: 'browser',
         os: rep.os,
         osVersion: rep.osVersion,
         device: rep.device,
         ...(group.latestAt ? { testedAt: group.latestAt } : {}),
         status: 'tested',
         summary: summarizeAssertions(group.assertions, group.sideEffects),
         items: group.items,
      });
   }
}

function resolveCoverage(
   localCases: readonly ScreenReaderTestCase[],
   ariaAtPlans: readonly AriaAtPlanFile[],
): FeatureReport['sourceCoverage'] {
   if (localCases.length > 0 && ariaAtPlans.length > 0) {
      return 'both';
   }
   if (localCases.length > 0) {
      return 'local';
   }
   return 'w3c-aria-at';
}

function compareFeatureReports(left: FeatureReport, right: FeatureReport): number {
   if (left.sourceCoverage !== right.sourceCoverage) {
      return (
         COVERAGE_SORT_ORDER[left.sourceCoverage] -
         COVERAGE_SORT_ORDER[right.sourceCoverage]
      );
   }
   if (left.type !== right.type) {
      return left.type.localeCompare(right.type);
   }
   return left.refId.localeCompare(right.refId);
}

function buildFeaturesCatalog(): readonly FeatureReport[] {
   const metaMap = collectFeatureMetadata();
   const envFiles = listEnvironmentFiles();
   const results: FeatureReport[] = [];

   for (const [key, meta] of metaMap.entries()) {
      const versionedEnvs: FeatureEnvironmentResult[] = [];
      appendLocalEnvsForFeature(meta.localCases, envFiles, versionedEnvs);
      const ariaAtGrouped = collectAriaAtGroupsForFeature(meta);
      appendAriaAtEnvsFromGroups(ariaAtGrouped, versionedEnvs);

      const localEnvsCount = versionedEnvs.filter(
         (item) => item.source === 'local' && item.status === 'tested',
      ).length;
      const ariaAtEnvsCount = versionedEnvs.filter(
         (item) => item.source === 'w3c-aria-at',
      ).length;
      const ariaAtPlans = [...meta.planMap.values()].toSorted((left, right) =>
         left.title.localeCompare(right.title),
      );

      results.push({
         key,
         type: meta.type,
         refId: meta.refId,
         title: meta.refId,
         linkText: meta.linkText,
         specURL: meta.specURL,
         sourceCoverage: resolveCoverage(meta.localCases, ariaAtPlans),
         localCases: meta.localCases,
         ariaAtPlans,
         versionedEnvironments: versionedEnvs,
         testedEnvironmentCount: localEnvsCount + ariaAtEnvsCount,
         localEnvironmentCount: localEnvsCount,
         ariaAtEnvironmentCount: ariaAtEnvsCount,
      });
   }

   return results.toSorted(compareFeatureReports);
}

interface FeaturesCacheState {
   features: readonly FeatureReport[] | undefined;
}

const cacheState: FeaturesCacheState = {
   features: undefined,
};

export function resetFeaturesCache(): void {
   cacheState.features = undefined;
}

export function listFeatures(): readonly FeatureReport[] {
   cacheState.features ??= buildFeaturesCatalog();
   return cacheState.features;
}

export function getFeatureReport(
   type: FeatureType,
   refId: string,
): FeatureReport | undefined {
   return listFeatures().find(
      (feature) => feature.type === type && feature.refId === refId,
   );
}

export function listFeatureSummaryForTestAttribute(
   attribute: string,
): FeatureReport | undefined {
   return listFeatures().find((feature) => feature.refId === attribute);
}
