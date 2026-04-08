import {
   coverageArtifactSchema,
   coverageLookupResultSchema,
   criteriaByLevelArtifactSchema,
   criteriaByLevelResultSchema,
   criterionLookupResultSchema,
   normalizedCriteriaArtifactSchema,
   quickrefTagLookupResultSchema,
   strategyArtifactSchema,
   verificationStrategyLookupResultSchema,
   wcagLevelSchema,
   wcagVersionSchema,
   type CoverageLookupResult,
   type CriteriaByLevelResult,
   type CriterionLookupKey,
   type CriterionLookupResult,
   type NormalizedCriteriaArtifact,
   type NormalizedCriterion,
   type QuickrefTagLookupResult,
   type VerificationStrategyLookupResult,
   type WcagLevel,
   type WcagVersion,
} from '@a11lied/contracts';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
   artifactsCache,
   supportedVersions,
   type EngineArtifacts,
} from './engine-data.js';
import { WcagEngineNotFoundError, WcagEngineValidationError } from './engine-errors.js';

const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const generatedRoot = resolve(packageRoot, '../wcag-data/data/generated');

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

export function getArtifacts(version: WcagVersion): EngineArtifacts {
   const cached = artifactsCache.get(version);
   if (cached) {
      return cached;
   }

   const nextArtifacts = buildArtifacts(version);
   artifactsCache.set(version, nextArtifacts);
   return nextArtifacts;
}

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

export function getVerificationStrategy(
   lookupKey: CriterionLookupKey,
   options?: { version?: string },
): VerificationStrategyLookupResult {
   const version = parseVersion(options?.version);
   const criterion = resolveCriterion(version, lookupKey);
   const strategy = getArtifacts(version).strategies[criterion.id];

   if (!strategy) {
      throw new WcagEngineNotFoundError(lookupKey);
   }

   return verificationStrategyLookupResultSchema.parse({
      lookupKey,
      criterionId: criterion.id,
      strategy,
   });
}

export function resetWcagEngineCache(): void {
   artifactsCache.clear();
}
