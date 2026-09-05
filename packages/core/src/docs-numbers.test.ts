import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
   getCoverage,
   getCoverageSummary,
   listCriteriaByLevel,
} from '@a11ied/wcag-engine';

const rootDir = resolve(import.meta.dirname, '../../..');
const docsPagesDir = resolve(rootDir, 'packages/docs/src/pages');

function readDocsPage(page: string): string {
   return readFileSync(resolve(docsPagesDir, page), 'utf8');
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

describe('docs numeric claims', () => {
   it('states the counts the pinned WCAG data actually holds', () => {
      expectNumericClaimsMatchTheData();
   });
});
