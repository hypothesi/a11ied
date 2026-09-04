import {
   axeRuleLookupResultSchema,
   coverageLookupResultSchema,
   criteriaByLevelResultSchema,
   criterionLookupResultSchema,
   quickrefTagLookupResultSchema,
   techniqueLookupResultSchema,
   wcagLevelSchema,
   wcagVersionSchema,
   type AxeRuleLookupResult,
   type CoverageLookupResult,
   type CoverageSummaryArtifact,
   type CriteriaByLevelResult,
   type CriterionLookupKey,
   type CriterionLookupResult,
   type NormalizedCriterion,
   type QuickrefTagLookupResult,
   type TechniqueLookupResult,
   type WcagLevel,
   type WcagVersion,
} from '@a11ied/contracts';

import {
   artifactsCache,
   supportedVersions,
   type EngineArtifacts,
} from '../shared/data.js';
import { WcagEngineNotFoundError, WcagEngineValidationError } from '../errors/index.js';
import { loadEngineArtifacts } from './load.js';

/** Loads the generated artifact bundle for one supported WCAG version. */
export function getArtifacts(version: WcagVersion): EngineArtifacts {
   const cached = artifactsCache.get(version);
   if (cached) {
      return cached;
   }

   const nextArtifacts = loadEngineArtifacts(version);
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

function listCriteriaByIds(
   artifacts: EngineArtifacts,
   criterionIds: string[],
): NormalizedCriterion[] {
   return criterionIds.flatMap((criterionId) => {
      const criterion = artifacts.criteria[criterionId];
      if (!criterion) {
         return [];
      }
      return [criterion];
   });
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

/** Returns the pinned coverage totals per level for one WCAG version. */
export function getCoverageSummary(options?: {
   version?: string;
}): CoverageSummaryArtifact {
   return getArtifacts(parseVersion(options?.version)).coverageSummary;
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

/**
 * Resolves one technique or failure by its W3C id (G18, F65, ARIA22) from the generated
 * technique and failure indexes, with every criterion it is listed under.
 */
export function getTechnique(
   lookupKey: string,
   options?: { version?: string },
): TechniqueLookupResult {
   const artifacts = getArtifacts(parseVersion(options?.version));
   const technique = artifacts.techniques[lookupKey] ?? artifacts.failures[lookupKey];

   if (!technique) {
      throw new WcagEngineNotFoundError(lookupKey, 'technique');
   }

   return techniqueLookupResultSchema.parse({
      lookupKey,
      technique,
      criteria: listCriteriaByIds(artifacts, technique.criterionIds),
   });
}

/** Resolves one axe-core rule id to the criteria it maps to in the pinned data. */
export function getAxeRule(
   ruleId: string,
   options?: { version?: string },
): AxeRuleLookupResult {
   const artifacts = getArtifacts(parseVersion(options?.version));
   const rule = artifacts.axeRules[ruleId];

   if (!rule) {
      throw new WcagEngineNotFoundError(ruleId, 'axe rule');
   }

   return axeRuleLookupResultSchema.parse({
      ruleId,
      rule,
      criteria: listCriteriaByIds(artifacts, rule.criterionIds),
   });
}

/** Clears the in-memory artifact cache used by the WCAG engine. */
export function resetWcagEngineCache(): void {
   artifactsCache.clear();
}
