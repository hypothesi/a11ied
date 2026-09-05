import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
   getCoverage,
   getCoverageSummary,
   listCriteriaByLevel,
} from '@a11ied/wcag-engine';

const rootDir = resolve(import.meta.dirname, '../../..');
const docsPagesDir = resolve(rootDir, 'packages/docs/src/pages');
const maintainerReleaseChecklistPath = resolve(
   rootDir,
   'internal-docs/maintainer-release-checklist.md',
);
const skillPath = resolve(rootDir, 'packages/skills/a11ied/SKILL.md');
const skillInstallConfigPath = resolve(rootDir, 'packages/skills/ai.json');
const ciWorkflowPath = resolve(rootDir, '.github/workflows/ci.yml');
const publishWorkflowPath = resolve(rootDir, '.github/workflows/publish.yml');
const releaseReadinessPath = resolve(
   rootDir,
   'internal-docs/releases/v0.1.0-readiness.md',
);
const requiredRuntimePages = [
   'index.astro',
   'install.astro',
   'quickstart.astro',
   'targets.astro',
   'coverage.astro',
   'applicability.astro',
   'guides/screen-reader.astro',
   'guides/testing.astro',
   'guides/agents.astro',
   'guides/agent-skill.astro',
   'guides/recording.astro',
   'guides/violations.astro',
   'guides/scripting.astro',
   'guides/ci.astro',
   'guides/troubleshooting.astro',
   'reference/cli.astro',
   'reference/mcp.astro',
   'reference/api.astro',
   'reference/wcag-data.astro',
] as const;
const requiredNavRoutes = [
   '/install',
   '/quickstart',
   '/targets',
   '/coverage',
   '/applicability',
   '/guides/screen-reader',
   '/guides/testing',
   '/guides/agents',
   '/guides/agent-skill',
   '/guides/recording',
   '/guides/violations',
   '/guides/scripting',
   '/guides/ci',
   '/guides/troubleshooting',
   '/reference/cli',
   '/reference/mcp',
   '/reference/api',
   '/reference/wcag-data',
] as const;
const requiredHomeRoutes = [
   '/quickstart',
   '/targets',
   '/coverage',
   '/guides/agent-skill',
   '/reference/cli',
   '/reference/mcp',
   '/reference/api',
] as const;
const requiredCiWorkflowSteps = [
   'name: Data validation',
   'name: Standards',
   'name: Prose',
   'name: Test',
   'name: Pack public workspaces',
] as const;
const requiredPublishWorkflowSteps = [
   'name: Data validation',
   'name: Standards',
   'name: Test',
   'name: Pack public workspaces',
   'name: Publish public workspaces',
] as const;

function readDocsPage(page: string): string {
   return readFileSync(resolve(docsPagesDir, page), 'utf8');
}

function expectRuntimePages(): void {
   for (const page of requiredRuntimePages) {
      expect(existsSync(resolve(docsPagesDir, page))).toBe(true);
   }
}

function expectHomeRoutes(): void {
   const homePage = readDocsPage('index.astro');
   for (const route of requiredHomeRoutes) {
      expect(homePage).toContain(route);
   }
}

function expectNavRoutes(): void {
   const nav = readFileSync(resolve(rootDir, 'packages/docs/src/lib/nav.ts'), 'utf8');
   for (const route of requiredNavRoutes) {
      expect(nav).toContain(`'${route}'`);
   }
}

function expectSkillGuardrails(): void {
   const skill = readFileSync(skillPath, 'utf8');
   const installConfig = readFileSync(skillInstallConfigPath, 'utf8');
   expect(skill).toContain('resolve the criterion or target level before testing');
   expect(skill).toContain('automated');
   expect(skill).toContain('hybrid');
   expect(skill).toContain('manual');
   expect(skill).toContain('Do not confuse raw driver transcripts with WCAG claims');
   expect(installConfig).toContain('"a11ied"');
   expect(installConfig).toContain('"./a11ied/"');
   expect(readDocsPage('guides/agent-skill.astro')).toContain('--only skills --user');
}

function expectWorkflowSteps(): void {
   const ciWorkflow = readFileSync(ciWorkflowPath, 'utf8');
   const publishWorkflow = readFileSync(publishWorkflowPath, 'utf8');
   for (const step of requiredCiWorkflowSteps) {
      expect(ciWorkflow).toContain(step);
   }
   for (const step of requiredPublishWorkflowSteps) {
      expect(publishWorkflow).toContain(step);
   }
}

function expectReleaseChecklist(): void {
   const releaseChecklist = readFileSync(maintainerReleaseChecklistPath, 'utf8');
   expect(releaseChecklist).toContain('manual macOS VoiceOver smoke pass');
   expect(releaseChecklist).toContain('manual Windows NVDA smoke pass');
   expect(releaseChecklist).toContain('Wait for all CI checks to pass');
   expect(releaseChecklist).toContain('npm test');
   expect(releaseChecklist).toContain('npm run pack:check');
   expect(releaseChecklist).toContain('Publish order');
   expect(releaseChecklist).toContain('deferred items');
}

function expectSurfaceDoc(page: string, requiredText: string): void {
   expect(readDocsPage(page)).toContain(requiredText);
}

function expectCliSurfaceDocs(): void {
   expectSurfaceDoc('reference/cli.astro', 'Command families');
   expectSurfaceDoc('reference/cli.astro', 'a1 wcag show status-messages');
   expectSurfaceDoc('reference/cli.astro', 'npx playwright install chromium');
   expectSurfaceDoc('reference/cli.astro', 'Chrome, Edge, Brave, or Chromium');
   expectSurfaceDoc('reference/cli.astro', 'A11IED_STATE_DIR');
   expectSurfaceDoc('reference/cli.astro', 'One session is active at a time');
}

function expectConceptSurfaceDocs(): void {
   expectSurfaceDoc('applicability.astro', 'applicable');
   expectSurfaceDoc('applicability.astro', 'not-detected');
   expectSurfaceDoc('applicability.astro', 'out-of-scope');
   expectSurfaceDoc('coverage.astro', 'automated');
   expectSurfaceDoc('coverage.astro', 'hybrid');
   expectSurfaceDoc('coverage.astro', 'manual');
   expectSurfaceDoc('targets.astro', '--allow-virtual');
   expectSurfaceDoc('targets.astro', 'targetType');
}

function expectMcpAndApiSurfaceDocs(): void {
   expectSurfaceDoc('reference/mcp.astro', 'The 13 tools');
   expectSurfaceDoc('reference/mcp.astro', 'runs every mapped rule, matching');
   expectSurfaceDoc('reference/mcp.astro', 'sr_session');
   expectSurfaceDoc('reference/mcp.astro', 'sr_action');
   expectSurfaceDoc('reference/mcp.astro', 'npx -y a11ied mcp');
   expectSurfaceDoc('reference/api.astro', 'The scoped packages');
   expectSurfaceDoc('reference/api.astro', 'Export map');
}

function expectGuideSurfaceDocs(): void {
   expectSurfaceDoc('guides/recording.astro', 'What can be recorded');
   expectSurfaceDoc('guides/recording.astro', '.mov');
   expectSurfaceDoc('guides/recording.astro', '.mp4');
   expectSurfaceDoc('guides/recording.astro', 'sr start --sr voiceover --recording');
   expectSurfaceDoc('guides/recording.astro', 'transcript');
   expectSurfaceDoc('guides/recording.astro', 'Install Chrome, Edge, Brave, or Chromium');
   expectSurfaceDoc('guides/screen-reader.astro', 'a1 sr stop');
   expectSurfaceDoc('install.astro', 'npx -y @guidepup/setup setup');
   expectSurfaceDoc('install.astro', 'npx -y @guidepup/setup install');
   expectSurfaceDoc('install.astro', 'a1 setup');
   expectSurfaceDoc('install.astro', 'a1 doctor --strict');
   expectSurfaceDoc('reference/cli.astro', 'a1 setup');
   expectSurfaceDoc('quickstart.astro', 'a1 sr stop');
}

function expectNewGuideSurfaceDocs(): void {
   expectSurfaceDoc('guides/violations.astro', 'critical');
   expectSurfaceDoc('guides/violations.astro', 'a1 wcag rule');
   expectSurfaceDoc('guides/violations.astro', 'failureSummary');
   expectSurfaceDoc('guides/scripting.astro', '"ok": true');
   expectSurfaceDoc('guides/scripting.astro', 'exit code');
   expectSurfaceDoc('guides/scripting.astro', '--baseline');
   expectSurfaceDoc('guides/ci.astro', '--sr virtual --allow-virtual');
   expectSurfaceDoc('guides/ci.astro', 'npx playwright install chromium');
   expectSurfaceDoc('guides/ci.astro', 'a1 doctor --strict');
   expectSurfaceDoc('guides/troubleshooting.astro', 'missing-session');
   expectSurfaceDoc('guides/troubleshooting.astro', 'browser-unavailable');
}

function expectTestApiDocs(): void {
   expectSurfaceDoc('guides/testing.astro', 'await using sr = await screenReader');
   expectSurfaceDoc('guides/testing.astro', 'toHaveSpokenInOrder');
   expectSurfaceDoc('guides/testing.astro', '@vitest/browser-playwright');
   expectSurfaceDoc('targets.astro', 'jsdom');
   expectSurfaceDoc('reference/api.astro', 'a11ied/test');
}

function expectNoStaleAxeExample(): void {
   for (const page of requiredRuntimePages) {
      expect(readDocsPage(page)).not.toContain('a1 axe --criterion 4.1.3');
   }
}

const wcagConformanceLevelsLowToHigh = ['A', 'AA', 'AAA'] as const;
const expectedCoverageTotals = {
   automated: 28,
   hybrid: 10,
   manual: 48,
   unknown: 0,
   criteria: 86,
};
const expectedLevelACriteriaCount = 31;
const expectedLevelAACriteriaCount = 24;
const expectedLevelAAACriteriaCount = 31;
const expectedAxeRulesThroughLevelAA = 73;

/**
 * Union of axeRuleIds across every criterion at or below `level`, as axe --level resolves
 * it.
 */
function countAxeRulesThroughLevel(
   level: (typeof wcagConformanceLevelsLowToHigh)[number],
   version: string,
): number {
   const highestIndex = wcagConformanceLevelsLowToHigh.indexOf(level);
   const includedLevels = wcagConformanceLevelsLowToHigh.filter(
      (entry) => wcagConformanceLevelsLowToHigh.indexOf(entry) <= highestIndex,
   );
   const criteria = includedLevels.flatMap(
      (entry) => listCriteriaByLevel(entry, version).criteria,
   );
   const ruleIds = criteria.flatMap(
      (criterion) => getCoverage(criterion.id, { version }).coverage.axeRuleIds,
   );

   return new Set(ruleIds).size;
}

/** Recomputes the coverage totals and the level-AA axe rule count from the pinned data. */
function expectCoverageNumbersMatchTheData(): void {
   const summary = getCoverageSummary({ version: '2.2' });
   const axeRulesThroughAA = countAxeRulesThroughLevel('AA', '2.2');

   expect(summary.totals).toEqual(expectedCoverageTotals);
   expect(summary.byLevel.A.criteria).toBe(expectedLevelACriteriaCount);
   expect(summary.byLevel.AA.criteria).toBe(expectedLevelAACriteriaCount);
   expect(summary.byLevel.AA).toMatchObject({ automated: 8, hybrid: 4, manual: 12 });
   expect(summary.byLevel.AAA.criteria).toBe(expectedLevelAAACriteriaCount);
   expect(axeRulesThroughAA).toBe(expectedAxeRulesThroughLevelAA);
}

/**
 * Checks the docs state the same numbers {@link expectCoverageNumbersMatchTheData}
 * verified.
 */
function expectDocsStateTheRealNumbers(): void {
   const summary = getCoverageSummary({ version: '2.2' });
   const index = readDocsPage('index.astro');
   const quickstart = readDocsPage('quickstart.astro');
   const cli = readDocsPage('reference/cli.astro');
   const coverage = readDocsPage('coverage.astro');

   expect(index).toContain('73 axe rules');
   expect(quickstart).toContain('73 rules');
   expect(cli).toContain('73 rules');
   expect(index).toContain('24 success criteria');
   expect(coverage).toContain('86 criteria. 28 automated, 10 hybrid, 48 manual.');
   expect(coverage).toContain(
      `${String(summary.coverageSources.criteriaWithAxe)} criteria have at least one axe rule`,
   );
   expect(coverage).toContain(
      `${String(summary.coverageSources.criteriaWithAct)} have at least one ACT rule`,
   );
   expect(coverage).toContain(
      `${String(summary.coverageSources.criteriaWithBoth)} have both`,
   );
}

/**
 * Recomputes the coverage totals and the level-AA axe rule count from the pinned data and
 * checks the docs against the real numbers, so a stale count fails the build instead of
 * misleading a reader.
 */
function expectNumericClaimsMatchTheData(): void {
   expectCoverageNumbersMatchTheData();
   expectDocsStateTheRealNumbers();
}

function expectPublicSurfaceDocs(): void {
   expectCliSurfaceDocs();
   expectConceptSurfaceDocs();
   expectMcpAndApiSurfaceDocs();
   expectGuideSurfaceDocs();
   expectNewGuideSurfaceDocs();
   expectTestApiDocs();
   expectNoStaleAxeExample();
   expectNumericClaimsMatchTheData();
   expect(existsSync(resolve(docsPagesDir, 'release-checklist.astro'))).toBe(false);
}

function expectReleaseReadinessRecord(): void {
   const releaseReadiness = readFileSync(releaseReadinessPath, 'utf8');
   expect(releaseReadiness).toContain('## release path');
   expect(releaseReadiness).toContain('### packages');
   expect(releaseReadiness).toContain('### docs');
   expect(releaseReadiness).toContain('### agent skill');
   expect(releaseReadiness).toContain('## deferred items');
   expect(releaseReadiness).toContain('publish-packages');
   expect(releaseReadiness).toContain('npm run pack:check');
}

describe('docs, skill guidance, CI, and release checks', () => {
   it('covers the required runtime topics through docs routes', () => {
      expectRuntimePages();
      expectNavRoutes();
      expectHomeRoutes();
      expectPublicSurfaceDocs();
   });

   it('keeps the skill guardrails explicit', () => {
      expectSkillGuardrails();
   });

   it('requires CI and release checks that match the shipping policy', () => {
      expectWorkflowSteps();
      expectReleaseChecklist();
      expectReleaseReadinessRecord();
   });
});
