import { describe, expect, it } from 'vitest';

import { committedArtifactRegressionFixture } from '../test/regression-fixtures.js';

import { readCommittedGeneratedJson } from './index.test-helpers.js';

function assertCommittedCriteriaCounts(
   criteria22: { criteria: Record<string, unknown> },
   criteria21: { criteria: Record<string, unknown> },
): void {
   expect(Object.keys(criteria22.criteria)).toHaveLength(
      committedArtifactRegressionFixture.versions['2.2'].criteriaCount,
   );
   expect(Object.keys(criteria21.criteria)).toHaveLength(
      committedArtifactRegressionFixture.versions['2.1'].criteriaCount,
   );
}

function assertCommittedCoverageTotals(
   summary22: { totals: Record<string, number> },
   summary21: { totals: Record<string, number> },
): void {
   expect(summary22.totals).toMatchObject(
      committedArtifactRegressionFixture.versions['2.2'].coverageTotals,
   );
   expect(summary21.totals).toMatchObject(
      committedArtifactRegressionFixture.versions['2.1'].coverageTotals,
   );
}

function assertCommittedProvenanceIsCorrect(provenance: {
   rawSources: Array<{ fileName: string }>;
   artifacts: Array<{ fileName: string; sourceUrls: string[] }>;
}): void {
   expect(provenance.rawSources.map((entry) => entry.fileName)).toEqual(
      committedArtifactRegressionFixture.provenance.rawSourceFiles,
   );
   expect(
      provenance.artifacts.find((entry) => entry.fileName === 'criteria.2.2.json')
         ?.sourceUrls,
   ).toEqual(committedArtifactRegressionFixture.provenance.criteria22SourceUrls);
   expect(
      provenance.artifacts.find((entry) => entry.fileName === 'coverage.2.2.json')
         ?.sourceUrls,
   ).toEqual(committedArtifactRegressionFixture.provenance.coverage22SourceUrls);
}

interface CommittedRegressionData {
   criteria22: { criteria: Record<string, unknown> };
   criteria21: { criteria: Record<string, unknown> };
   summary22: { totals: Record<string, number> };
   summary21: { totals: Record<string, number> };
   provenance: {
      rawSources: Array<{ fileName: string }>;
      artifacts: Array<{ fileName: string; sourceUrls: string[] }>;
   };
}

async function loadCommittedRegressionData(): Promise<CommittedRegressionData> {
   const criteria22 = await readCommittedGeneratedJson<{
      criteria: Record<string, unknown>;
   }>('criteria.2.2.json');
   const criteria21 = await readCommittedGeneratedJson<{
      criteria: Record<string, unknown>;
   }>('criteria.2.1.json');
   const summary22 = await readCommittedGeneratedJson<{
      totals: Record<string, number>;
   }>('coverage-summary.2.2.json');
   const summary21 = await readCommittedGeneratedJson<{
      totals: Record<string, number>;
   }>('coverage-summary.2.1.json');
   const provenance = await readCommittedGeneratedJson<{
      rawSources: Array<{ fileName: string }>;
      artifacts: Array<{ fileName: string; sourceUrls: string[] }>;
   }>('generated-provenance.json');
   return { criteria22, criteria21, summary22, summary21, provenance };
}

describe('wcag-data committed regression fixtures', () => {
   it('keeps committed artifact counts and provenance pinned to the expected sources', async () => {
      const data = await loadCommittedRegressionData();

      assertCommittedCriteriaCounts(data.criteria22, data.criteria21);
      assertCommittedCoverageTotals(data.summary22, data.summary21);
      assertCommittedProvenanceIsCorrect(data.provenance);
   });

   it('keeps representative criteria pinned to known slugs, levels, tags, and technique counts', async () => {
      const criteriaArtifact = await readCommittedGeneratedJson<{
         criteria: Record<
            string,
            {
               slug: string;
               title: string;
               level: string;
               tags: string[];
               techniques: unknown[];
               failures: unknown[];
            }
         >;
      }>('criteria.2.2.json');

      for (const [criterionId, fixture] of Object.entries(
         committedArtifactRegressionFixture.representativeCriteria,
      )) {
         const criterion = criteriaArtifact.criteria[criterionId];
         expect(criterion).toBeDefined();
         expect(criterion?.slug).toBe(fixture.slug);
         expect(criterion?.title).toBe(fixture.title);
         expect(criterion?.level).toBe(fixture.level);
         expect(criterion?.techniques).toHaveLength(fixture.techniqueCount);
         expect(criterion?.failures).toHaveLength(fixture.failureCount);
         expect(criterion?.tags).toEqual(
            expect.arrayContaining([...fixture.requiredTags]),
         );
      }
   });
});
