import {
   coverageArtifactSchema,
   coverageLookupResultSchema,
   criteriaByLevelArtifactSchema,
   criteriaByLevelResultSchema,
   criterionLookupResultSchema,
   normalizedCriteriaArtifactSchema,
   quickrefTagLookupResultSchema,
   strategyArtifactSchema,
   wcagLevelSchema,
   wcagVersionSchema,
   type CoverageLookupResult,
   type CriteriaByLevelResult,
   type CriterionLookupKey,
   type CriterionLookupResult,
   type NormalizedCriteriaArtifact,
   type NormalizedCriterion,
   type QuickrefTagLookupResult,
   type WcagLevel,
   type WcagVersion,
} from '@a11ied/contracts';

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
   artifactsCache,
   supportedVersions,
   type EngineArtifacts,
} from '../shared/data.js';
import { WcagEngineNotFoundError, WcagEngineValidationError } from '../errors/index.js';

function resolveInstalledPath(specifier: string): string | undefined {
   try {
      return fileURLToPath(import.meta.resolve(specifier));
   } catch {
      return undefined;
   }
}

function resolveGeneratedRootFromPackage(): string | undefined {
   const packageJsonPath = resolveInstalledPath('@a11ied/wcag-data/package.json');
   if (packageJsonPath) {
      return resolve(dirname(packageJsonPath), 'data/generated');
   }

   const packageEntryPath = resolveInstalledPath('@a11ied/wcag-data');
   if (!packageEntryPath) {
      return undefined;
   }
   const packageDir = dirname(packageEntryPath);
   if (packageDir.endsWith('/dist')) {
      return resolve(packageDir, '../data/generated');
   }
   return resolve(packageDir, 'data/generated');
}

function getGeneratedRootCandidates(): string[] {
   return [
      resolve(import.meta.dirname, '../../wcag-data/data/generated'),
      resolve(import.meta.dirname, '../../../wcag-data/data/generated'),
      resolve(import.meta.dirname, '../../../packages/wcag-data/data/generated'),
      resolve(process.cwd(), 'packages/wcag-data/data/generated'),
   ];
}

function findExistingGeneratedRoot(candidates: string[]): string | undefined {
   for (const candidate of candidates) {
      if (existsSync(candidate)) {
         return candidate;
      }
   }
   return undefined;
}

function resolveGeneratedRoot(): string {
   const packageRoot = resolveGeneratedRootFromPackage();
   if (packageRoot) {
      return packageRoot;
   }

   const candidates = getGeneratedRootCandidates();
   const existingRoot = findExistingGeneratedRoot(candidates);
   if (existingRoot) {
      return existingRoot;
   }

   return resolve(process.cwd(), 'packages/wcag-data/data/generated');
}

const generatedRoot = resolveGeneratedRoot();

function loadArtifact<TResult>(
   schema: { parse: (data: unknown) => TResult },
   filePath: string,
): TResult {
   return schema.parse(JSON.parse(readFileSync(filePath, 'utf8')) as unknown);
}

function buildArtifacts(version: WcagVersion): EngineArtifacts {
   const criteriaArtifact = loadArtifact(
      normalizedCriteriaArtifactSchema,
      resolve(generatedRoot, `criteria.${version}.json`),
   );
   const criteriaByLevelArtifact = loadArtifact(
      criteriaByLevelArtifactSchema,
      resolve(generatedRoot, `criteria-by-level.${version}.json`),
   );
   const coverageArtifact = loadArtifact(
      coverageArtifactSchema,
      resolve(generatedRoot, `coverage.${version}.json`),
   );
   const strategyArtifact = loadArtifact(
      strategyArtifactSchema,
      resolve(generatedRoot, `strategy.${version}.json`),
   );
   const criteriaEntries = Object.values(
      criteriaArtifact.criteria,
   ) as NormalizedCriteriaArtifact['criteria'][string][];

   return {
      criteria: criteriaArtifact.criteria,
      criteriaByLevel: criteriaByLevelArtifact.levels,
      coverage: coverageArtifact.coverage,
      strategies: strategyArtifact.strategies,
      slugToId: Object.fromEntries(
         criteriaEntries.map((criterion) => [criterion.slug, criterion.id] as const),
      ),
   };
}

/** Loads the generated artifact bundle for one supported WCAG version. */
export function getArtifacts(version: WcagVersion): EngineArtifacts {
   const cached = artifactsCache.get(version);
   if (cached) {
      return cached;
   }

   const nextArtifacts = buildArtifacts(version);
   artifactsCache.set(version, nextArtifacts);
   return nextArtifacts;
}

/** Parses one supported WCAG version string for artifact access. */
export function parseVersion(version = '2.2'): WcagVersion {
   const result = wcagVersionSchema.safeParse(version);
   if (!result.success) {
      throw new WcagEngineValidationError('version', version, {
         supportedVersions: [...supportedVersions],
      });
   }
   return result.data;
}

function parseLevel(level: string): WcagLevel {
   const result = wcagLevelSchema.safeParse(level);
   if (!result.success) {
      throw new WcagEngineValidationError('level', level, {
         supportedLevels: [...wcagLevelSchema.options],
      });
   }
   return result.data;
}

export function resolveCriterion(
   version: WcagVersion,
   lookupKey: CriterionLookupKey,
): NormalizedCriterion {
   const artifacts = getArtifacts(version);
   const direct = artifacts.criteria[lookupKey];
   if (direct) {
      return direct;
   }

   const criterionId = artifacts.slugToId[lookupKey];
   if (criterionId) {
      const resolved = artifacts.criteria[criterionId];
      if (resolved) {
         return resolved;
      }
   }

   throw new WcagEngineNotFoundError(lookupKey);
}

/** Resolves one criterion by id or slug from the generated artifacts. */
export function getCriterion(
   lookupKey: CriterionLookupKey,
   options?: { version?: string },
): CriterionLookupResult {
   const version = parseVersion(options?.version);
   const criterion = resolveCriterion(version, lookupKey);

   return criterionLookupResultSchema.parse({
      lookupKey,
      criterion,
   });
}

/** Lists criteria for one conformance level from the generated artifacts. */
export function listCriteriaByLevel(
   level: string,
   version: string,
): CriteriaByLevelResult {
   const parsedVersion = parseVersion(version);
   const parsedLevel = parseLevel(level);
   const artifacts = getArtifacts(parsedVersion);
   const criterionIds = artifacts.criteriaByLevel[parsedLevel] ?? [];

   return criteriaByLevelResultSchema.parse({
      version: parsedVersion,
      level: parsedLevel,
      criteria: criterionIds.map((criterionId) => artifacts.criteria[criterionId]),
   });
}

/** Returns coverage metadata for one criterion from the generated artifacts. */
export function getCoverage(
   lookupKey: CriterionLookupKey,
   options?: { version?: string },
): CoverageLookupResult {
   const version = parseVersion(options?.version);
   const criterion = resolveCriterion(version, lookupKey);
   const artifacts = getArtifacts(version);
   const coverage = artifacts.coverage[criterion.id];
   const strategy = artifacts.strategies[criterion.id];

   if (!coverage || !strategy) {
      throw new WcagEngineNotFoundError(lookupKey);
   }

   return coverageLookupResultSchema.parse({
      lookupKey,
      criterion,
      coverage,
      strategy,
   });
}

/** Returns the indexed Quickref tags for one criterion. */
export function getQuickrefTags(
   lookupKey: CriterionLookupKey,
   options?: { version?: string },
): QuickrefTagLookupResult {
   const version = parseVersion(options?.version);
   const criterion = resolveCriterion(version, lookupKey);

   return quickrefTagLookupResultSchema.parse({
      lookupKey,
      criterionId: criterion.id,
      tags: criterion.tags,
   });
}

/** Clears the in-memory artifact cache used by the WCAG engine. */
export function resetWcagEngineCache(): void {
   artifactsCache.clear();
}
