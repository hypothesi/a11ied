import {
   coverageArtifactSchema,
   coverageSummaryArtifactSchema,
   strategyArtifactSchema,
   type CoverageState,
   type NormalizedCriteriaArtifact,
   type WcagVersion,
} from '@a11ied/contracts';

import type {
   ActMappingPayload,
   DerivedAxeRule,
   GeneratedCoverageArtifacts,
   StrategySeed,
} from '../shared/types.js';
import { buildActRuleIndex } from './act-rules.js';
import { buildAxeRuleIndex } from './axe-rules.js';
import { buildActCoverageIndex, buildAxeCoverageIndex } from './indexing.js';
import {
   defaultStrategySeed,
   strategyOverrideForCriterion,
} from './strategy.js';
import { buildSummaryTotals } from './summary.js';

const REPRESENTATIVE_LIMIT = 5;

function buildProcedureIds(axeRuleIds: string[], seed: StrategySeed): string[] {
   const prefix: string[] = [];
   if (axeRuleIds.length > 0 && seed.preferredEvidenceMode !== 'manual') {
      prefix.push('axe_scan');
   }
   return [...prefix, ...seed.procedureIds].filter(
      (val, idx, arr) => arr.indexOf(val) === idx,
   );
}

function buildSourceAttribution(input: {
   actRuleIds: string[];
   axeAttribution: string[];
   override: StrategySeed | undefined;
   axeRuleIds: string[];
}): string[] {
   const parts: string[] = [];
   if (input.actRuleIds.length > 0) {
      parts.push('act-mapping');
   }
   parts.push(...input.axeAttribution);
   if (input.override) {
      parts.push('strategy-heuristic');
   }
   if (
      !input.override &&
      input.axeRuleIds.length === 0 &&
      input.actRuleIds.length === 0
   ) {
      parts.push('manual-fallback');
   }
   return parts.toSorted((left, right) => left.localeCompare(right));
}

function buildCoverageNotes(
   seed: StrategySeed,
   actIds: string[],
   axeIds: string[],
): string[] {
   const notes = [...seed.notes];
   if (actIds.length > 0) {
      notes.push(`Mapped ACT rules: ${actIds.join(', ')}.`);
   }
   if (axeIds.length > 0) {
      notes.push(`Mapped axe rules: ${axeIds.join(', ')}.`);
   }
   return notes;
}

export interface CoverageEntry {
   criterionId: string;
   coverageState: CoverageState;
   axeRuleIds: string[];
   actRuleIds: string[];
   sourceAttribution: string[];
   notes: string[];
   updatedAt: string;
}

interface StrategyEntry {
   criterionId: string;
   preferredEvidenceMode: string;
   procedureIds: string[];
   requiresRealTarget: boolean;
   notes: string[];
}

function buildSingleEntry(input: {
   criterionId: string;
   actIndex: Map<string, string[]>;
   axeIndex: Map<string, { ruleIds: string[]; sourceAttribution: string[] }>;
   updatedAt: string;
}): readonly [string, CoverageEntry, StrategyEntry] {
   const actRuleIds = input.actIndex.get(input.criterionId) ?? [];
   const axeCov = input.axeIndex.get(input.criterionId);
   const axeRuleIds = axeCov?.ruleIds ?? [];
   const override = strategyOverrideForCriterion(input.criterionId);
   const seed =
      override ?? defaultStrategySeed(axeRuleIds.length > 0, actRuleIds.length > 0);
   return [
      input.criterionId,
      {
         criterionId: input.criterionId,
         coverageState: seed.preferredEvidenceMode as CoverageState,
         axeRuleIds,
         actRuleIds,
         sourceAttribution: buildSourceAttribution({
            actRuleIds,
            axeAttribution: axeCov?.sourceAttribution ?? [],
            override,
            axeRuleIds,
         }),
         notes: buildCoverageNotes(seed, actRuleIds, axeRuleIds),
         updatedAt: input.updatedAt,
      },
      {
         criterionId: input.criterionId,
         preferredEvidenceMode: seed.preferredEvidenceMode,
         procedureIds: buildProcedureIds(axeRuleIds, seed),
         requiresRealTarget: seed.requiresRealTarget,
         notes: seed.notes,
      },
   ] as const;
}

function buildSortedMaps(
   entries: ReadonlyArray<readonly [string, CoverageEntry, StrategyEntry]>,
): {
   coverage: Record<string, CoverageEntry>;
   strategies: Record<string, StrategyEntry>;
} {
   const coverage = Object.fromEntries(
      entries
         .map(([id, ce]) => [id, ce] as const)
         .toSorted(([left], [right]) =>
            left.localeCompare(right, undefined, { numeric: true }),
         ),
   );
   const strategies = Object.fromEntries(
      entries
         .map(([id, , se]) => [id, se] as const)
         .toSorted(([left], [right]) =>
            left.localeCompare(right, undefined, { numeric: true }),
         ),
   );
   return { coverage, strategies };
}

function parseArtifactSchemas(input: {
   version: WcagVersion;
   coverage: Record<string, CoverageEntry>;
   strategies: Record<string, StrategyEntry>;
   stats: ReturnType<typeof buildSummaryTotals>;
   updatedAt: string;
   axeRuleIndexArtifact: GeneratedCoverageArtifacts['axeRuleIndexArtifact'];
   actRuleIndexArtifact: GeneratedCoverageArtifacts['actRuleIndexArtifact'];
}): GeneratedCoverageArtifacts {
   return {
      axeRuleIndexArtifact: input.axeRuleIndexArtifact,
      actRuleIndexArtifact: input.actRuleIndexArtifact,
      coverageArtifact: coverageArtifactSchema.parse({
         version: input.version,
         coverage: input.coverage,
      }),
      strategyArtifact: strategyArtifactSchema.parse({
         version: input.version,
         strategies: input.strategies,
      }),
      coverageSummaryArtifact: coverageSummaryArtifactSchema.parse({
         version: input.version,
         updatedAt: input.updatedAt,
         totals: input.stats.totals,
         byLevel: input.stats.byLevel,
         coverageSources: {
            criteriaWithAxe: input.stats.withAxe,
            criteriaWithAct: input.stats.withAct,
            criteriaWithBoth: input.stats.withBoth,
         },
         representativeCriterionIds: {
            automated: input.stats.criteriaByState.automated.slice(
               0,
               REPRESENTATIVE_LIMIT,
            ),
            hybrid: input.stats.criteriaByState.hybrid.slice(0, REPRESENTATIVE_LIMIT),
            manual: input.stats.criteriaByState.manual.slice(0, REPRESENTATIVE_LIMIT),
            unknown: input.stats.criteriaByState.unknown.slice(0, REPRESENTATIVE_LIMIT),
         },
      }),
   };
}

export function buildCoverageArtifacts(input: {
   version: WcagVersion;
   criteriaArtifact: NormalizedCriteriaArtifact;
   actMapping: ActMappingPayload;
   axeRules: DerivedAxeRule[];
   updatedAt: string;
}): GeneratedCoverageArtifacts {
   const actIndex = buildActCoverageIndex({
      criteriaArtifact: input.criteriaArtifact,
      actMapping: input.actMapping,
   });
   const axeIndex = buildAxeCoverageIndex({
      criteriaArtifact: input.criteriaArtifact,
      actCoverageIndex: actIndex,
      axeRules: input.axeRules,
   });
   const entries = Object.values(input.criteriaArtifact.criteria).map((_criterion) =>
      buildSingleEntry({
         criterionId: _criterion.id,
         actIndex,
         axeIndex,
         updatedAt: input.updatedAt,
      }),
   );
   const { coverage, strategies } = buildSortedMaps(entries);
   const stats = buildSummaryTotals({
      criteriaArtifact: input.criteriaArtifact,
      coverage,
   });
   return parseArtifactSchemas({
      version: input.version,
      coverage,
      strategies,
      stats,
      updatedAt: input.updatedAt,
      axeRuleIndexArtifact: buildAxeRuleIndex({
         version: input.version,
         axeRules: input.axeRules,
         axeCoverageIndex: axeIndex,
      }),
      actRuleIndexArtifact: buildActRuleIndex({
         version: input.version,
         actMapping: input.actMapping,
         actCoverageIndex: actIndex,
      }),
   });
}
