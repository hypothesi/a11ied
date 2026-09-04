import { readFile, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
   generateNormalizedArtifacts,
   runWcagDataSync,
   syncRawSources,
   validateGeneratedArtifacts,
   type WcagDataDirectories,
} from './index.js';

import {
   assertEndToEndSyncResult,
   assertRawAndGeneratedValidation,
   createFetchImpl,
   createTestDirectories,
   EXPECTED_22_COVERAGE_COUNTS,
   EXPECTED_CRITERIA_COUNTS_BY_VERSION,
   EXPECTED_COVERAGE_COUNTS_BY_VERSION,
   EXPECTED_GENERATED_ARTIFACT_COUNT,
   SYNC_TIMESTAMP,
} from './testing/helpers.js';

function assertGeneratedCriteriaCounts(result: {
   criteriaCountByVersion: Record<string, number>;
   coverageCountsByVersion: Record<string, Record<string, number>>;
}): void {
   expect(result.criteriaCountByVersion).toEqual(EXPECTED_CRITERIA_COUNTS_BY_VERSION);
   expect(result.coverageCountsByVersion).toEqual(EXPECTED_COVERAGE_COUNTS_BY_VERSION);
}

function assertGeneratedEntriesAreComplete(generatedEntries: string[]): void {
   expect(generatedEntries).toEqual(
      expect.arrayContaining([
         'criteria.2.2.json',
         'criteria-by-level.2.2.json',
         'coverage.2.2.json',
         'coverage-summary.2.2.json',
         'strategy.2.2.json',
         'slug-index.2.2.json',
         'technique-index.2.2.json',
         'failure-index.2.2.json',
         'axe-rules.2.2.json',
         'criteria.2.1.json',
         'criteria-by-level.2.1.json',
         'coverage.2.1.json',
         'coverage-summary.2.1.json',
         'strategy.2.1.json',
         'slug-index.2.1.json',
         'technique-index.2.1.json',
         'failure-index.2.1.json',
         'axe-rules.2.1.json',
         'generated-provenance.json',
      ]),
   );
}

function assertProvenanceRawSources(manifest: {
   rawSources: Array<{ fileName: string }>;
}): void {
   expect(manifest.rawSources.map((entry) => entry.fileName)).toEqual(
      expect.arrayContaining([
         'wcag.2.2.json',
         'wcag.2.1.json',
         'quickref-tags.yml',
         'act-mapping.json',
         'axe-rules.json',
      ]),
   );
}

function assertProvenanceSourceUrls(manifest: {
   artifacts: Array<{ fileName: string; sourceUrls: string[] }>;
}): void {
   expect(
      manifest.artifacts.find((entry) => entry.fileName === 'criteria.2.2.json')
         ?.sourceUrls,
   ).toEqual([
      'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml',
      'https://www.w3.org/WAI/WCAG22/wcag.json',
   ]);
   expect(
      manifest.artifacts.find((entry) => entry.fileName === 'coverage.2.2.json')
         ?.sourceUrls,
   ).toEqual([
      'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml',
      'https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json',
      'https://www.w3.org/WAI/WCAG22/wcag.json',
      'npm:axe-core',
   ]);
}

async function assertProvenanceManifestIsCorrect(
   directories: WcagDataDirectories,
): Promise<void> {
   const manifest = JSON.parse(
      await readFile(join(directories.generated, 'generated-provenance.json'), 'utf8'),
   ) as {
      generatedAt: string;
      rawSources: Array<{ fileName: string }>;
      artifacts: Array<{ fileName: string; sourceUrls: string[] }>;
   };

   expect(manifest.generatedAt).toBe(SYNC_TIMESTAMP);
   assertProvenanceRawSources(manifest);
   assertProvenanceSourceUrls(manifest);
}

async function assertAxeRuleIndexIsCorrect(
   directories: WcagDataDirectories,
): Promise<void> {
   const axeRuleIndex = JSON.parse(
      await readFile(join(directories.generated, 'axe-rules.2.2.json'), 'utf8'),
   ) as { rules: Record<string, { criterionIds: string[]; tags: string[] }> };
   expect(axeRuleIndex.rules['target-size']?.criterionIds).toEqual(['2.5.8']);
   expect(axeRuleIndex.rules['target-size']?.tags).toContain('wcag258');
   expect(axeRuleIndex.rules.region?.criterionIds).toEqual([]);
}

async function assertCoverageArtifactIsCorrect(
   directories: WcagDataDirectories,
): Promise<void> {
   const coverageArtifact = JSON.parse(
      await readFile(join(directories.generated, 'coverage.2.2.json'), 'utf8'),
   ) as {
      coverage: Record<
         string,
         { coverageState: string; actRuleIds: string[]; axeRuleIds: string[] }
      >;
   };
   expect(coverageArtifact.coverage['2.5.8']).toMatchObject({
      coverageState: 'automated',
   });
   expect(coverageArtifact.coverage['2.4.7']).toMatchObject({
      coverageState: 'hybrid',
      actRuleIds: ['09f0ab'],
      axeRuleIds: [],
   });
   expect(coverageArtifact.coverage['3.3.8']).toMatchObject({ coverageState: 'manual' });
   expect(coverageArtifact.coverage['4.1.3']).toMatchObject({ coverageState: 'hybrid' });
}

function assertStrategyEntries(strategyArtifact: {
   strategies: Record<
      string,
      {
         preferredEvidenceMode: string;
         procedureIds: string[];
         requiresRealTarget: boolean;
      }
   >;
}): void {
   expect(strategyArtifact.strategies['4.1.3']).toMatchObject({
      preferredEvidenceMode: 'hybrid',
      procedureIds: ['status_message_probe'],
      requiresRealTarget: true,
   });
   expect(strategyArtifact.strategies['3.3.8']).toMatchObject({
      preferredEvidenceMode: 'manual',
      procedureIds: ['auth_flow_probe', 'manual_review'],
   });
}

function assertSummaryTotals(summaryArtifact: {
   totals: Record<string, number>;
   representativeCriterionIds: Record<string, string[]>;
}): void {
   expect(summaryArtifact.totals).toMatchObject({
      criteria:
         EXPECTED_22_COVERAGE_COUNTS.automated +
         EXPECTED_22_COVERAGE_COUNTS.hybrid +
         EXPECTED_22_COVERAGE_COUNTS.manual +
         EXPECTED_22_COVERAGE_COUNTS.unknown,
      ...EXPECTED_22_COVERAGE_COUNTS,
   });
   expect(summaryArtifact.representativeCriterionIds.hybrid).toEqual(['2.4.7', '4.1.3']);
}

async function assertStrategyAndSummaryArtifacts(
   directories: WcagDataDirectories,
): Promise<void> {
   const strategyArtifact = JSON.parse(
      await readFile(join(directories.generated, 'strategy.2.2.json'), 'utf8'),
   ) as {
      strategies: Record<
         string,
         {
            preferredEvidenceMode: string;
            procedureIds: string[];
            requiresRealTarget: boolean;
         }
      >;
   };
   const summaryArtifact = JSON.parse(
      await readFile(join(directories.generated, 'coverage-summary.2.2.json'), 'utf8'),
   ) as {
      totals: Record<string, number>;
      representativeCriterionIds: Record<string, string[]>;
   };

   assertStrategyEntries(strategyArtifact);
   assertSummaryTotals(summaryArtifact);
}

async function setupGeneratedArtifacts(): Promise<{
   directories: WcagDataDirectories;
   result: Awaited<ReturnType<typeof generateNormalizedArtifacts>>;
   generatedEntries: string[];
}> {
   const tempRoot = await mkdtemp(join(tmpdir(), 'a11ied-wcag-data-generated-'));
   const directories = createTestDirectories(tempRoot);
   await syncRawSources({
      directories,
      fetchImpl: createFetchImpl(),
      syncedAt: SYNC_TIMESTAMP,
   });
   const result = await generateNormalizedArtifacts(directories);
   const generatedEntries = await readdir(directories.generated);
   return { directories, result, generatedEntries };
}

async function readAllGeneratedContents(syncResult: {
   generatedArtifacts: Array<{ fileName: string; filePath: string }>;
}): Promise<ReadonlyArray<readonly [string, string]>> {
   return Promise.all(
      syncResult.generatedArtifacts.map(
         async (artifact) =>
            [artifact.fileName, await readFile(artifact.filePath, 'utf8')] as const,
      ),
   );
}

describe('wcag-data normalization / artifact generation', () => {
   it('writes generated artifacts and a committed provenance manifest', async () => {
      const { directories, result, generatedEntries } = await setupGeneratedArtifacts();

      assertGeneratedCriteriaCounts(result);
      assertGeneratedEntriesAreComplete(generatedEntries);
      await assertProvenanceManifestIsCorrect(directories);
      await assertCoverageArtifactIsCorrect(directories);
      await assertAxeRuleIndexIsCorrect(directories);
      await assertStrategyAndSummaryArtifacts(directories);
      await expect(validateGeneratedArtifacts(directories)).resolves.toHaveLength(
         EXPECTED_GENERATED_ARTIFACT_COUNT,
      );
   });
});

describe('wcag-data normalization / end-to-end determinism', () => {
   it('runs the end-to-end sync command deterministically across repeated executions', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'a11ied-wcag-data-run-'));
      const directories = createTestDirectories(tempRoot);

      const first = await runWcagDataSync({
         directories,
         fetchImpl: createFetchImpl(),
         syncedAt: SYNC_TIMESTAMP,
      });
      const firstGenerated = await readAllGeneratedContents(first);
      const second = await runWcagDataSync({
         directories,
         fetchImpl: createFetchImpl(),
         syncedAt: SYNC_TIMESTAMP,
      });
      const secondGenerated = await readAllGeneratedContents(second);

      assertEndToEndSyncResult(first);
      expect(firstGenerated).toEqual(secondGenerated);
      await assertRawAndGeneratedValidation(directories);
   });
});
