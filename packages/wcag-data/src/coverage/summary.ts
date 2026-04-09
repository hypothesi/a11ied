import type { CoverageState, NormalizedCriteriaArtifact } from '@a11ied/contracts';

import type { CoverageEntry } from './build.js';

const LEVEL_A = 'A' as const;

function emptyBucket(): {
   criteria: number;
   automated: number;
   hybrid: number;
   manual: number;
   unknown: number;
} {
   return { criteria: 0, automated: 0, hybrid: 0, manual: 0, unknown: 0 };
}

function accumulateBucket(
   bucket: ReturnType<typeof emptyBucket>,
   state: CoverageState,
): void {
   bucket.criteria += 1;
   bucket[state] += 1;
}

function initByLevel(): Record<string, ReturnType<typeof emptyBucket>> {
   return {
      [LEVEL_A]: emptyBucket(),
      AA: emptyBucket(),
      AAA: emptyBucket(),
   };
}

function initCriteriaByState(): Record<CoverageState, string[]> {
   return { automated: [], hybrid: [], manual: [], unknown: [] };
}

function accumulateToolOverlap(
   entry: CoverageEntry,
   result: { withAxe: number; withAct: number; withBoth: number },
): void {
   const hasAxe = entry.axeRuleIds.length > 0;
   const hasAct = entry.actRuleIds.length > 0;
   if (hasAxe) {
      result.withAxe += 1;
   }
   if (hasAct) {
      result.withAct += 1;
   }
   if (hasAxe && hasAct) {
      result.withBoth += 1;
   }
}

function countToolOverlap(input: {
   criteriaArtifact: NormalizedCriteriaArtifact;
   coverage: Record<string, CoverageEntry>;
}): { withAxe: number; withAct: number; withBoth: number } {
   const result = { withAxe: 0, withAct: 0, withBoth: 0 };
   for (const criterion of Object.values(input.criteriaArtifact.criteria)) {
      const entry = input.coverage[criterion.id];
      if (entry) {
         accumulateToolOverlap(entry, result);
      }
   }
   return result;
}

function accumulateCriterionCoverage(
   criterion: { id: string; level: string },
   entry: CoverageEntry,
   accumulators: {
      totals: ReturnType<typeof emptyBucket>;
      byLevel: Record<string, ReturnType<typeof emptyBucket>>;
      criteriaByState: Record<CoverageState, string[]>;
   },
): void {
   accumulateBucket(accumulators.totals, entry.coverageState);
   const levelBucket = accumulators.byLevel[criterion.level];
   if (!levelBucket) {
      throw new Error(`missing coverage bucket for level ${criterion.level}`);
   }
   accumulateBucket(levelBucket, entry.coverageState);
   accumulators.criteriaByState[entry.coverageState].push(criterion.id);
}

export function buildSummaryTotals(input: {
   criteriaArtifact: NormalizedCriteriaArtifact;
   coverage: Record<string, CoverageEntry>;
}): {
   totals: ReturnType<typeof emptyBucket>;
   byLevel: Record<string, ReturnType<typeof emptyBucket>>;
   criteriaByState: Record<CoverageState, string[]>;
   withAxe: number;
   withAct: number;
   withBoth: number;
} {
   const totals = emptyBucket();
   const byLevel = initByLevel();
   const criteriaByState = initCriteriaByState();
   for (const criterion of Object.values(input.criteriaArtifact.criteria)) {
      const entry = input.coverage[criterion.id];
      if (!entry) {
         throw new Error(`missing coverage entry for ${criterion.id}`);
      }
      accumulateCriterionCoverage(criterion, entry, { totals, byLevel, criteriaByState });
   }
   const overlap = countToolOverlap(input);
   return { totals, byLevel, criteriaByState, ...overlap };
}
