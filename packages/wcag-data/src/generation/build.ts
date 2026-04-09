import type { CoverageState, WcagVersion } from '@a11ied/contracts';

import type {
   ActMappingPayload,
   DerivedAxeRule,
   FetchLike,
   GeneratedArtifactProvenance,
   GeneratedArtifactWriteResult,
   GeneratedProvenanceManifest,
   NormalizedArtifactsResult,
   WcagDataDirectories,
} from '../shared/types.js';
import { toJsonString } from '../shared/utils.js';
import { ensureWcagDataDirectories, wcagVersions } from '../sources/definitions.js';
import {
   loadQuickrefTags,
   loadRawJson,
   loadRawProvenanceEntries,
   syncRawSources,
} from '../sources/sync.js';
import { latestSyncedAt, processVersion, writeGeneratedArtifact } from './version.js';

async function loadSharedData(directories: WcagDataDirectories): Promise<{
   quickrefTags: Awaited<ReturnType<typeof loadQuickrefTags>>;
   rawSources: Awaited<ReturnType<typeof loadRawProvenanceEntries>>;
   actMapping: ActMappingPayload;
   axeRules: DerivedAxeRule[];
}> {
   const [quickrefTags, rawSources, actMapping, axeRules] = await Promise.all([
      loadQuickrefTags(directories),
      loadRawProvenanceEntries(directories),
      loadRawJson<ActMappingPayload>(directories, 'act-mapping.json'),
      loadRawJson<DerivedAxeRule[]>(directories, 'axe-rules.json'),
   ]);
   return { quickrefTags, rawSources, actMapping, axeRules };
}

function accumulateVersionResult(
   acc: {
      generatedArtifacts: GeneratedArtifactWriteResult[];
      manifestArtifacts: GeneratedArtifactProvenance[];
      criteriaCountByVersion: Record<WcagVersion, number>;
      coverageCountsByVersion: Record<WcagVersion, Record<CoverageState, number>>;
   },
   version: WcagVersion,
   result: Awaited<ReturnType<typeof processVersion>>,
): void {
   acc.generatedArtifacts.push(...result.generated);
   acc.manifestArtifacts.push(...result.manifest);
   acc.criteriaCountByVersion[version] = result.criteriaCount;
   acc.coverageCountsByVersion[version] = result.coverageCounts;
}

function assembleResults(versionResults: Awaited<ReturnType<typeof processVersion>>[]): {
   generatedArtifacts: GeneratedArtifactWriteResult[];
   manifestArtifacts: GeneratedArtifactProvenance[];
   criteriaCountByVersion: Record<WcagVersion, number>;
   coverageCountsByVersion: Record<WcagVersion, Record<CoverageState, number>>;
} {
   const generatedArtifacts: GeneratedArtifactWriteResult[] = [];
   const manifestArtifacts: GeneratedArtifactProvenance[] = [];
   const criteriaCountByVersion = {} as Record<WcagVersion, number>;
   const coverageCountsByVersion = {} as Record<
      WcagVersion,
      Record<CoverageState, number>
   >;
   for (const [idx, version] of wcagVersions.entries()) {
      const result = versionResults[idx];
      if (!result) {
         throw new Error(`missing result for version ${version}`);
      }
      accumulateVersionResult(
         {
            generatedArtifacts,
            manifestArtifacts,
            criteriaCountByVersion,
            coverageCountsByVersion,
         },
         version,
         result,
      );
   }
   return {
      generatedArtifacts,
      manifestArtifacts,
      criteriaCountByVersion,
      coverageCountsByVersion,
   };
}

/** Generates the committed WCAG artifact set from the synced raw sources. */
export async function generateNormalizedArtifacts(
   directories?: WcagDataDirectories,
): Promise<NormalizedArtifactsResult> {
   const dirs = directories ?? (await ensureWcagDataDirectories());
   const shared = await loadSharedData(dirs);
   const versionResults = await Promise.all(
      wcagVersions.map((version) =>
         processVersion({
            version,
            directories: dirs,
            rawSources: shared.rawSources,
            actMapping: shared.actMapping,
            axeRules: shared.axeRules,
            quickrefTags: shared.quickrefTags,
         }),
      ),
   );
   const assembled = assembleResults(versionResults);
   const manifest: GeneratedProvenanceManifest = {
      generatedAt: latestSyncedAt(shared.rawSources),
      rawSources: [...shared.rawSources].toSorted((left, right) =>
         left.sourceId.localeCompare(right.sourceId),
      ),
      artifacts: [...assembled.manifestArtifacts].toSorted((left, right) =>
         left.fileName.localeCompare(right.fileName),
      ),
   };
   assembled.generatedArtifacts.push(
      await writeGeneratedArtifact(
         dirs,
         'generated-provenance.json',
         toJsonString(manifest),
      ),
   );
   return {
      generatedArtifacts: assembled.generatedArtifacts.toSorted((left, right) =>
         left.fileName.localeCompare(right.fileName),
      ),
      criteriaCountByVersion: assembled.criteriaCountByVersion,
      coverageCountsByVersion: assembled.coverageCountsByVersion,
   };
}

/** Runs the full WCAG data sync pipeline from raw fetch through generated artifacts. */
export async function runWcagDataSync(options?: {
   directories?: WcagDataDirectories;
   fetchImpl?: FetchLike;
   syncedAt?: string;
}): Promise<{
   fetchList: string[];
   rawArtifacts: GeneratedArtifactWriteResult[];
   axeRuleCount: number;
   generatedArtifacts: GeneratedArtifactWriteResult[];
   criteriaCountByVersion: Record<WcagVersion, number>;
   coverageCountsByVersion: Record<WcagVersion, Record<CoverageState, number>>;
}> {
   const dirs = options?.directories ?? (await ensureWcagDataDirectories());
   const rawSync = await syncRawSources({ ...options, directories: dirs });
   const normalized = await generateNormalizedArtifacts(dirs);
   return {
      fetchList: rawSync.fetchList,
      rawArtifacts: rawSync.artifacts,
      axeRuleCount: rawSync.axeRuleCount,
      generatedArtifacts: normalized.generatedArtifacts,
      criteriaCountByVersion: normalized.criteriaCountByVersion,
      coverageCountsByVersion: normalized.coverageCountsByVersion,
   };
}
