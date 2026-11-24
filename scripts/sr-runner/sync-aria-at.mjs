import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GRAPHQL_ENDPOINT = 'https://aria-at.w3.org/api/graphql';
const UPSTREAM_ORIGIN = 'https://aria-at.w3.org';
const OUT_ROOT = resolve(process.cwd(), 'packages', 'support-data', 'data', 'aria-at');
const PLANS_DIR = resolve(OUT_ROOT, 'plans');
const JSON_INDENT = 3;
const PLAN_SYNC_DELAY_MS = 90;

const REPORTS_OVERVIEW_QUERY = `
query ReportsPageQuery {
  testPlanVersions(phases: [CANDIDATE, RECOMMENDED]) {
    id
    title
    phase
    gitSha
    updatedAt
    versionString
    metadata
    testPlan {
      directory
    }
    testPlanReports(isFinal: true) {
      id
      at {
        id
        key
        name
      }
      browser {
        id
        key
        name
      }
    }
  }
  ariaHtmlFeaturesMetrics {
    ariaFeatures {
      refId
      type
      linkText
      value
      total
      passed
      failed
      untestable
      passedPercentage
    }
    htmlFeatures {
      refId
      type
      linkText
      value
      total
      passed
      failed
      untestable
      passedPercentage
    }
  }
}`;

const PLAN_DETAIL_QUERY = `
query ReportPageQuery($testPlanVersionId: ID) {
  testPlanVersion(id: $testPlanVersionId) {
    id
    title
    phase
    gitSha
    updatedAt
    versionString
    metadata
    testPlan {
      directory
    }
    testPlanReports(isFinal: true) {
      id
      markedFinalAt
      at {
        id
        key
        name
      }
      browser {
        id
        key
        name
      }
      recommendedAtVersion {
        name
      }
      exactAtVersion {
        name
      }
      minimumAtVersion {
        name
      }
      finalizedTestResults {
        completedAt
        test {
          title
          rowNumber
          renderedUrl
        }
        atVersion {
          name
        }
        browserVersion {
          name
        }
        scenarioResults {
          output
          untestable
          scenario {
            commands {
              text
              atOperatingMode
            }
          }
          assertionResults {
            passed
            assertion {
              id
              text
              priority
              atBugs {
                title
                url
              }
              references {
                refId
                value
                type
                linkText
              }
            }
          }
          negativeSideEffects {
            text
            impact
            details
            atBugs {
              title
              url
            }
          }
        }
      }
    }
  }
}`;

function delay(ms) {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

async function fetchGraphQL(query, variables = {}) {
   const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
   });

   if (!response.ok) {
      throw new Error(
         `ARIA-AT GraphQL HTTP ${String(response.status)}: ${response.statusText}`,
      );
   }
   const payload = await response.json();
   if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      const messages = payload.errors.map((err) => err.message).join('; ');
      throw new Error(`ARIA-AT GraphQL error: ${messages}`);
   }
   return payload.data;
}

function toPlanSlug(directory) {
   return String(directory ?? 'unknown')
      .trim()
      .toLowerCase()
      .replaceAll('/', '-')
      .replaceAll(/[^a-z0-9-]+/gu, '-')
      .replaceAll(/-+/gu, '-')
      .replaceAll(/^-|-$/gu, '');
}

function resolveOsAndDevice(atKey, atVersion) {
   if (atKey === 'voiceover_macos') {
      const hasExactOs = Boolean(atVersion) && atVersion !== 'Not specified';
      return {
         os: 'macOS',
         osVersion: hasExactOs ? atVersion : 'Not recorded by ARIA-AT',
         device: 'Mac (model not recorded by ARIA-AT)',
      };
   }
   return {
      os: 'Windows',
      osVersion: 'Not recorded by ARIA-AT',
      device: 'PC (model not recorded by ARIA-AT)',
   };
}

function normalizePriority(rawPriority) {
   if (rawPriority === 'MUST' || rawPriority === 'SHOULD' || rawPriority === 'MAY') {
      return rawPriority;
   }
   return 'MUST';
}

function normalizeVerdict(passed, priority, scenarioUntestable) {
   if (scenarioUntestable || passed === undefined || passed === null) {
      return 'untestable';
   }
   if (passed === true) {
      return 'pass';
   }
   return priority === 'MAY' ? 'unsupported' : 'fail';
}

function createEmptyCounts() {
   return {
      passed: 0,
      failed: 0,
      untestable: 0,
      unsupported: 0,
      total: 0,
   };
}

function bumpCounts(bucket, verdict) {
   bucket.total += 1;
   if (verdict === 'pass') {
      bucket.passed += 1;
   } else if (verdict === 'fail') {
      bucket.failed += 1;
   } else if (verdict === 'untestable') {
      bucket.untestable += 1;
   } else if (verdict === 'unsupported') {
      bucket.unsupported += 1;
   }
}

function recordAssertionSummary(summary, priority, verdict) {
   if (priority === 'MUST') {
      bumpCounts(summary.must, verdict);
   } else if (priority === 'SHOULD') {
      bumpCounts(summary.should, verdict);
   } else {
      bumpCounts(summary.may, verdict);
   }
}

function normalizeRenderedUrl(renderedUrl) {
   if (!renderedUrl) {
      return;
   }
   if (renderedUrl.startsWith('http://') || renderedUrl.startsWith('https://')) {
      return renderedUrl;
   }
   return `${UPSTREAM_ORIGIN}${renderedUrl.startsWith('/') ? '' : '/'}${renderedUrl}`;
}

function normalizeSpecRefType(rawType) {
   if (rawType === 'aria') {
      return 'aria';
   }
   if (rawType === 'html' || rawType === 'htmlAam') {
      return 'html';
   }
}

function normalizeBugRefs(rawBugs) {
   if (!Array.isArray(rawBugs)) {
      return [];
   }
   return rawBugs
      .filter((bug) => bug?.title && bug?.url)
      .map((bug) => ({
         title: String(bug.title),
         url: String(bug.url),
      }));
}

function normalizeAssertion({ item, idx, scenarioUntestable, featureMap, summary }) {
   const rawAssertion = item.assertion ?? {};
   const priority = normalizePriority(rawAssertion.priority);
   const verdict = normalizeVerdict(item.passed, priority, scenarioUntestable);

   const refs = Array.isArray(rawAssertion.references) ? rawAssertion.references : [];
   const matchedRefs = [];
   for (const rawRef of refs) {
      const normalizedType = normalizeSpecRefType(rawRef?.type);
      if (rawRef?.refId && normalizedType) {
         const refId = String(rawRef.refId);
         matchedRefs.push({ refId, type: normalizedType });
         featureMap.set(`${normalizedType}:${refId}`, {
            refId,
            type: normalizedType,
            linkText: rawRef.linkText || `${refId} Specification`,
            specURL: rawRef.value || '',
         });
      }
   }

   recordAssertionSummary(summary, priority, verdict);
   const record = {
      id: String(rawAssertion.id ?? `a-${String(idx + 1)}`),
      priority,
      statement: String(rawAssertion.text ?? ''),
      verdict,
   };
   const primaryRef = matchedRefs[0];
   if (primaryRef) {
      record.featureRef = primaryRef.refId;
      record.featureType = primaryRef.type;
      if (matchedRefs.length > 1) {
         record.featureRefs = matchedRefs;
      }
   }
   const bugs = normalizeBugRefs(rawAssertion.atBugs);
   if (bugs.length > 0) {
      record.bugs = bugs;
   }
   return record;
}

function normalizeSideEffect(effect, summary) {
   const impact = effect.impact === 'SEVERE' ? 'SEVERE' : 'MODERATE';
   if (impact === 'SEVERE') {
      summary.severeSideEffects += 1;
   } else {
      summary.moderateSideEffects += 1;
   }
   const entry = {
      text: String(effect.text ?? ''),
      impact,
   };
   if (effect.details) {
      entry.details = String(effect.details);
   }
   const bugs = normalizeBugRefs(effect.atBugs);
   if (bugs.length > 0) {
      entry.bugs = bugs;
   }
   return entry;
}

function normalizeScenario(rawScenario, featureMap, summary) {
   const rawCommands = Array.isArray(rawScenario.scenario?.commands)
      ? rawScenario.scenario.commands
      : [];
   const commands = rawCommands.map((cmd) => ({
      text: String(cmd.text ?? '').trim(),
      mode: String(cmd.atOperatingMode ?? '').trim(),
   }));

   const scenarioUntestable = Boolean(rawScenario.untestable);
   const rawAssertions = Array.isArray(rawScenario.assertionResults)
      ? rawScenario.assertionResults
      : [];
   const assertions = rawAssertions.map((item, idx) =>
      normalizeAssertion({ item, idx, scenarioUntestable, featureMap, summary }),
   );

   const rawSideEffects = Array.isArray(rawScenario.negativeSideEffects)
      ? rawScenario.negativeSideEffects
      : [];
   const negativeSideEffects = rawSideEffects.map((effect) =>
      normalizeSideEffect(effect, summary),
   );

   return {
      commands,
      output: String(rawScenario.output ?? ''),
      untestable: scenarioUntestable,
      assertions,
      negativeSideEffects,
   };
}

function normalizeTestItem({ rawTest, context }) {
   const scenarioResults = Array.isArray(rawTest.scenarioResults)
      ? rawTest.scenarioResults
      : [];
   const commandResults = scenarioResults.map((rawScenario) =>
      normalizeScenario(rawScenario, context.featureMap, context.summary),
   );

   const normalizedTest = {
      testTitle: String(rawTest.test?.title ?? 'Untitled Test'),
      rowNumber: Number(rawTest.test?.rowNumber ?? 0),
      atVersion: String(rawTest.atVersion?.name ?? context.atVersion),
      browserVersion: String(rawTest.browserVersion?.name ?? context.browserVersion),
      commandResults,
   };
   const renderedUrl = normalizeRenderedUrl(rawTest.test?.renderedUrl);
   if (renderedUrl) {
      normalizedTest.renderedUrl = renderedUrl;
   }
   if (rawTest.completedAt) {
      normalizedTest.completedAt = String(rawTest.completedAt);
   }
   return normalizedTest;
}

function resolveReportVersions(rawReport, sortedTests) {
   const testWithATVer = sortedTests.find((item) => item.atVersion?.name);
   const testWithBrowserVer = sortedTests.find((item) => item.browserVersion?.name);
   const atVersion =
      rawReport.exactAtVersion?.name ||
      testWithATVer?.atVersion?.name ||
      rawReport.minimumAtVersion?.name ||
      rawReport.recommendedAtVersion?.name ||
      'Not specified';
   const browserVersion = testWithBrowserVer?.browserVersion?.name || 'Not specified';
   return { atVersion: String(atVersion), browserVersion: String(browserVersion) };
}

function normalizeReport(rawReport, featureMap) {
   const rawTests = Array.isArray(rawReport.finalizedTestResults)
      ? rawReport.finalizedTestResults
      : [];
   const sortedTests = rawTests.toSorted(
      (left, right) => (left.test?.rowNumber ?? 0) - (right.test?.rowNumber ?? 0),
   );

   const { atVersion, browserVersion } = resolveReportVersions(rawReport, sortedTests);
   const atKey = rawReport.at?.key ?? 'unknown';
   const { os, osVersion, device } = resolveOsAndDevice(atKey, atVersion);
   const summary = {
      must: createEmptyCounts(),
      should: createEmptyCounts(),
      may: createEmptyCounts(),
      severeSideEffects: 0,
      moderateSideEffects: 0,
   };

   const context = { atVersion, browserVersion, featureMap, summary };
   const tests = sortedTests.map((rawTest) => normalizeTestItem({ rawTest, context }));

   const envReport = {
      reportID: String(rawReport.id),
      atKey,
      atName: String(rawReport.at?.name ?? atKey),
      atVersion,
      browserKey: String(rawReport.browser?.key ?? 'unknown'),
      browserName: String(rawReport.browser?.name ?? 'Unknown'),
      browserVersion,
      os,
      osVersion,
      device,
      summary,
      tests,
   };
   if (rawReport.markedFinalAt) {
      envReport.markedFinalAt = String(rawReport.markedFinalAt);
   }
   return envReport;
}

function registerFeaturePlanRefs(featureRefs, slug, featureToPlanSlugs) {
   for (const ref of featureRefs) {
      const key = `${ref.type}:${ref.refId}`;
      let planSet = featureToPlanSlugs.get(key);
      if (!planSet) {
         planSet = new Set();
         featureToPlanSlugs.set(key, planSet);
      }
      planSet.add(slug);
   }
}

function buildPlanPayload({ tpv, slug, directory, featureRefs, reports }) {
   const metadata = tpv.metadata ?? {};
   const payload = {
      schemaVersion: 1,
      planVersionID: String(tpv.id),
      slug,
      directory,
      title: String(tpv.title ?? directory),
      versionString: String(tpv.versionString ?? ''),
      phase: String(tpv.phase ?? 'CANDIDATE'),
      gitSha: String(tpv.gitSha ?? ''),
      updatedAt: String(tpv.updatedAt ?? ''),
      upstreamURL: `${UPSTREAM_ORIGIN}/test-plan/${String(tpv.id)}`,
      featureRefs,
      reports,
   };
   if (metadata.exampleUrl) {
      payload.exampleURL = String(metadata.exampleUrl);
   }
   if (metadata.designPatternUrl) {
      payload.designPatternURL = String(metadata.designPatternUrl);
   }
   return payload;
}

async function syncSinglePlan(overviewPlan, state) {
   const directory = overviewPlan.testPlan?.directory ?? overviewPlan.id;
   const slug = toPlanSlug(directory);
   process.stdout.write(`[aria-at] Syncing ${directory} (${slug})...\n`);

   const detailData = await fetchGraphQL(PLAN_DETAIL_QUERY, {
      testPlanVersionId: overviewPlan.id,
   });
   const tpv = detailData?.testPlanVersion;
   if (!tpv) {
      return;
   }

   const featureMap = new Map();
   const rawReports = Array.isArray(tpv.testPlanReports) ? tpv.testPlanReports : [];
   const reports = rawReports
      .filter(
         (rep) =>
            Array.isArray(rep.finalizedTestResults) &&
            rep.finalizedTestResults.length > 0,
      )
      .map((rep) => normalizeReport(rep, featureMap));

   state.totalReportsCount += reports.length;
   const featureRefs = [...featureMap.values()].toSorted((left, right) =>
      `${left.type}:${left.refId}`.localeCompare(`${right.type}:${right.refId}`),
   );
   registerFeaturePlanRefs(featureRefs, slug, state.featureToPlanSlugs);

   const planPayload = buildPlanPayload({ tpv, slug, directory, featureRefs, reports });
   writeFileSync(
      resolve(PLANS_DIR, `${slug}.json`),
      `${JSON.stringify(planPayload, undefined, JSON_INDENT)}\n`,
   );
   state.planSummaries.push({
      slug,
      directory,
      title: planPayload.title,
      versionString: planPayload.versionString,
      phase: planPayload.phase,
      planVersionID: planPayload.planVersionID,
      reportsCount: reports.length,
      featureRefs: featureRefs.map((ref) => `${ref.type}:${ref.refId}`),
   });
}

async function syncPlansSequentially(rawPlanList, state, index = 0) {
   if (index >= rawPlanList.length) {
      return;
   }
   await syncSinglePlan(rawPlanList[index], state);
   await delay(PLAN_SYNC_DELAY_MS);
   await syncPlansSequentially(rawPlanList, state, index + 1);
}

function buildFeatureSummaries(rawAriaFeatures, rawHtmlFeatures, featureToPlanSlugs) {
   const combined = [];
   for (const item of rawAriaFeatures) {
      combined.push({ item, type: 'aria' });
   }
   for (const item of rawHtmlFeatures) {
      combined.push({ item, type: 'html' });
   }

   return combined
      .map(({ item, type }) => {
         const refId = String(item.refId ?? '');
         const planSlugs = [
            ...(featureToPlanSlugs.get(`${type}:${refId}`) ?? []),
         ].toSorted();
         return {
            refId,
            type,
            linkText: String(item.linkText ?? refId),
            specURL: String(item.value ?? ''),
            total: Number(item.total ?? 0),
            passed: Number(item.passed ?? 0),
            failed: Number(item.failed ?? 0),
            untestable: Number(item.untestable ?? 0),
            passedPercentage: Number(item.passedPercentage ?? 0),
            planSlugs,
         };
      })
      .toSorted((left, right) => {
         if (left.type !== right.type) {
            return left.type.localeCompare(right.type);
         }
         return left.refId.localeCompare(right.refId);
      });
}

async function main() {
   process.stdout.write('[aria-at] Fetching published test plan overview...\n');
   const overview = await fetchGraphQL(REPORTS_OVERVIEW_QUERY);
   const rawPlanList = Array.isArray(overview?.testPlanVersions)
      ? overview.testPlanVersions
      : [];
   const rawAriaFeatures = overview?.ariaHtmlFeaturesMetrics?.ariaFeatures ?? [];
   const rawHtmlFeatures = overview?.ariaHtmlFeaturesMetrics?.htmlFeatures ?? [];

   rmSync(PLANS_DIR, { recursive: true, force: true });
   mkdirSync(PLANS_DIR, { recursive: true });

   const state = {
      featureToPlanSlugs: new Map(),
      planSummaries: [],
      totalReportsCount: 0,
   };
   await syncPlansSequentially(rawPlanList, state);

   const features = buildFeatureSummaries(
      rawAriaFeatures,
      rawHtmlFeatures,
      state.featureToPlanSlugs,
   );

   const summaryPayload = {
      schemaVersion: 1,
      syncedAt: new Date().toISOString(),
      upstreamURL: `${UPSTREAM_ORIGIN}/reports/aria-features`,
      license:
         'W3C Document License (https://www.w3.org/Consortium/Legal/copyright-documents)',
      plansCount: state.planSummaries.length,
      reportsCount: state.totalReportsCount,
      features,
      plans: state.planSummaries.toSorted((left, right) =>
         left.title.localeCompare(right.title),
      ),
   };

   writeFileSync(
      resolve(OUT_ROOT, 'summary.json'),
      `${JSON.stringify(summaryPayload, undefined, JSON_INDENT)}\n`,
   );
   process.stdout.write(
      `[aria-at] Done: synced ${String(state.planSummaries.length)} test plans (${String(state.totalReportsCount)} finalized reports) and ${String(features.length)} features.\n`,
   );
}

try {
   await main();
} catch (error) {
   process.stderr.write(
      `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
   );
   process.exitCode = 1;
}
