import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { TestMethod, WcagVersion } from '@a11ied/contracts';

import type {
   ActMappingPayload,
   DerivedAxeRule,
   GeneratedArtifactProvenance,
   GeneratedArtifactWriteResult,
   QuickrefTagsPayload,
   RawSourceProvenance,
   WcagDataDirectories,
   WcagPayload,
} from '../shared/types.js';
import { sha256, toJsonString } from '../shared/utils.js';
import { normalizeCriteriaArtifacts } from '../normalization/criteria.js';
import { loadRawJson } from '../sources/sync.js';
import { buildTestMethodArtifacts } from '../test-methods/build.js';

const CRITERIA_PREFIXES = [
   'criteria.',
   'criteria-by-level.',
   'slug-index.',
   'technique-index.',
   'failure-index.',
];

function isCriteriaArtifact(fileName: string): boolean {
   return CRITERIA_PREFIXES.some((prefix) => fileName.startsWith(prefix));
}

export async function writeGeneratedArtifact(
   directories: WcagDataDirectories,
   fileName: string,
   body: string,
): Promise<GeneratedArtifactWriteResult> {
   const filePath = join(directories.generated, fileName);
   await writeFile(filePath, body, 'utf8');
   return { fileName, filePath };
}

export function latestSyncedAt(
   rawSources: Array<RawSourceProvenance & { fileName: string }>,
): string {
   const sorted = rawSources
      .map((source) => source.syncedAt)
      .toSorted((_left, _right) => _right.localeCompare(_left));
   return sorted[0] ?? new Date().toISOString();
}

function buildCriteriaArtifactBodies(input: {
   version: WcagVersion;
   artifacts: ReturnType<typeof normalizeCriteriaArtifacts>;
}): Array<{ fileName: string; body: string }> {
   return [
      {
         fileName: `criteria.${input.version}.json`,
         body: toJsonString(input.artifacts.criteriaArtifact),
      },
      {
         fileName: `criteria-by-level.${input.version}.json`,
         body: toJsonString(input.artifacts.criteriaByLevelArtifact),
      },
      {
         fileName: `slug-index.${input.version}.json`,
         body: toJsonString(input.artifacts.slugIndexArtifact),
      },
      {
         fileName: `technique-index.${input.version}.json`,
         body: toJsonString(input.artifacts.techniqueIndexArtifact),
      },
      {
         fileName: `failure-index.${input.version}.json`,
         body: toJsonString(input.artifacts.failureIndexArtifact),
      },
   ];
}

function buildTestMethodArtifactBodies(input: {
   version: WcagVersion;
   testMethodArtifacts: ReturnType<typeof buildTestMethodArtifacts>;
}): Array<{ fileName: string; body: string }> {
   return [
      {
         fileName: `test-methods.${input.version}.json`,
         body: toJsonString(input.testMethodArtifacts.testMethodArtifact),
      },
      {
         fileName: `strategy.${input.version}.json`,
         body: toJsonString(input.testMethodArtifacts.strategyArtifact),
      },
      {
         fileName: `test-method-summary.${input.version}.json`,
         body: toJsonString(input.testMethodArtifacts.testMethodSummaryArtifact),
      },
      {
         fileName: `axe-rules.${input.version}.json`,
         body: toJsonString(input.testMethodArtifacts.axeRuleIndexArtifact),
      },
      {
         fileName: `act-rules.${input.version}.json`,
         body: toJsonString(input.testMethodArtifacts.actRuleIndexArtifact),
      },
   ];
}

function resolveSourceFileNames(
   fileName: string,
   criteriaFileNames: string[],
   allFileNames: string[],
): string[] {
   if (isCriteriaArtifact(fileName)) {
      return [...criteriaFileNames];
   }
   return [...allFileNames];
}

function resolveSourceUrls(input: {
   fileName: string;
   criteriaFileNames: string[];
   rawSources: Array<RawSourceProvenance & { fileName: string }>;
   sourceUrls: string[];
}): string[] {
   if (isCriteriaArtifact(input.fileName)) {
      return input.rawSources
         .filter((src) => input.criteriaFileNames.includes(src.fileName))
         .map((source) => source.sourceUrl)
         .toSorted((left, right) => left.localeCompare(right));
   }
   return [...input.sourceUrls];
}

function buildManifestEntries(input: {
   artifactBodies: Array<{ fileName: string; body: string }>;
   version: WcagVersion;
   criteriaFileNames: string[];
   allFileNames: string[];
   rawSources: Array<RawSourceProvenance & { fileName: string }>;
   sourceUrls: string[];
}): GeneratedArtifactProvenance[] {
   return input.artifactBodies.map((art) => ({
      fileName: art.fileName,
      sha256: sha256(art.body),
      wcagVersion: input.version,
      sourceFileNames: resolveSourceFileNames(
         art.fileName,
         input.criteriaFileNames,
         input.allFileNames,
      ),
      sourceUrls: resolveSourceUrls({
         fileName: art.fileName,
         criteriaFileNames: input.criteriaFileNames,
         rawSources: input.rawSources,
         sourceUrls: input.sourceUrls,
      }),
   }));
}

function buildAllArtifactBodies(input: {
   version: WcagVersion;
   artifacts: ReturnType<typeof normalizeCriteriaArtifacts>;
   covArts: ReturnType<typeof buildTestMethodArtifacts>;
}): Array<{ fileName: string; body: string }> {
   return [
      ...buildCriteriaArtifactBodies({
         version: input.version,
         artifacts: input.artifacts,
      }),
      ...buildTestMethodArtifactBodies({
         version: input.version,
         testMethodArtifacts: input.covArts,
      }),
   ];
}

function buildTestMethodCounts(
   covArts: ReturnType<typeof buildTestMethodArtifacts>,
): Record<TestMethod, number> {
   return {
      automated: covArts.testMethodSummaryArtifact.totals.automated,
      hybrid: covArts.testMethodSummaryArtifact.totals.hybrid,
      manual: covArts.testMethodSummaryArtifact.totals.manual,
      unknown: covArts.testMethodSummaryArtifact.totals.unknown,
   };
}

function resolveAllSourceUrls(input: {
   rawSources: Array<RawSourceProvenance & { fileName: string }>;
   allFileNames: string[];
}): string[] {
   return input.rawSources
      .filter((src) => input.allFileNames.includes(src.fileName))
      .map((source) => source.sourceUrl)
      .toSorted((left, right) => left.localeCompare(right));
}

function buildVersionFileNames(version: WcagVersion): {
   allFileNames: string[];
   criteriaFileNames: string[];
} {
   return {
      allFileNames: [
         `wcag.${version}.json`,
         'quickref-tags.yml',
         'act-mapping.json',
         'axe-rules.json',
      ],
      criteriaFileNames: [`wcag.${version}.json`, 'quickref-tags.yml'],
   };
}

async function writeArtifacts(
   directories: WcagDataDirectories,
   artifactBodies: Array<{ fileName: string; body: string }>,
): Promise<GeneratedArtifactWriteResult[]> {
   return Promise.all(
      artifactBodies.map((ab) =>
         writeGeneratedArtifact(directories, ab.fileName, ab.body),
      ),
   );
}

function buildVersionResult(input: {
   artifacts: ReturnType<typeof normalizeCriteriaArtifacts>;
   covArts: ReturnType<typeof buildTestMethodArtifacts>;
   version: WcagVersion;
   rawSources: Array<RawSourceProvenance & { fileName: string }>;
   directories: WcagDataDirectories;
}): Promise<{
   generated: GeneratedArtifactWriteResult[];
   manifest: GeneratedArtifactProvenance[];
   criteriaCount: number;
   testMethodCounts: Record<TestMethod, number>;
}> {
   const { allFileNames, criteriaFileNames } = buildVersionFileNames(input.version);
   const sourceUrls = resolveAllSourceUrls({
      rawSources: input.rawSources,
      allFileNames,
   });
   const artifactBodies = buildAllArtifactBodies({
      version: input.version,
      artifacts: input.artifacts,
      covArts: input.covArts,
   });

   return writeArtifacts(input.directories, artifactBodies).then((generated) => ({
      generated,
      manifest: buildManifestEntries({
         artifactBodies,
         version: input.version,
         criteriaFileNames,
         allFileNames,
         rawSources: input.rawSources,
         sourceUrls,
      }),
      criteriaCount: Object.keys(input.artifacts.criteriaArtifact.criteria).length,
      testMethodCounts: buildTestMethodCounts(input.covArts),
   }));
}

export async function processVersion(input: {
   version: WcagVersion;
   directories: WcagDataDirectories;
   rawSources: Array<RawSourceProvenance & { fileName: string }>;
   actMapping: ActMappingPayload;
   axeRules: DerivedAxeRule[];
   quickrefTags: QuickrefTagsPayload;
}): Promise<{
   generated: GeneratedArtifactWriteResult[];
   manifest: GeneratedArtifactProvenance[];
   criteriaCount: number;
   testMethodCounts: Record<TestMethod, number>;
}> {
   const wcag = await loadRawJson<WcagPayload>(
      input.directories,
      `wcag.${input.version}.json`,
   );
   const artifacts = normalizeCriteriaArtifacts({
      version: input.version,
      wcag,
      quickrefTags: input.quickrefTags,
   });
   const covArts = buildTestMethodArtifacts({
      version: input.version,
      criteriaArtifact: artifacts.criteriaArtifact,
      actMapping: input.actMapping,
      axeRules: input.axeRules,
      updatedAt: latestSyncedAt(input.rawSources),
   });

   return buildVersionResult({
      artifacts,
      covArts,
      version: input.version,
      rawSources: input.rawSources,
      directories: input.directories,
   });
}
