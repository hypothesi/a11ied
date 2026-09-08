import type { TestMethod, NormalizedCriteriaArtifact } from '@a11ied/contracts';

import type { TestMethodEntry } from './build.js';

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
   state: TestMethod,
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

function initCriteriaByState(): Record<TestMethod, string[]> {
   return { automated: [], hybrid: [], manual: [], unknown: [] };
}

function accumulateToolOverlap(
   entry: TestMethodEntry,
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
   testMethods: Record<string, TestMethodEntry>;
}): { withAxe: number; withAct: number; withBoth: number } {
   const result = { withAxe: 0, withAct: 0, withBoth: 0 };
   for (const criterion of Object.values(input.criteriaArtifact.criteria)) {
      const entry = input.testMethods[criterion.id];
      if (entry) {
         accumulateToolOverlap(entry, result);
      }
   }
   return result;
}

function accumulateCriterionTestMethod(
   criterion: { id: string; level: string },
   entry: TestMethodEntry,
   accumulators: {
      totals: ReturnType<typeof emptyBucket>;
      byLevel: Record<string, ReturnType<typeof emptyBucket>>;
      criteriaByState: Record<TestMethod, string[]>;
   },
): void {
   accumulateBucket(accumulators.totals, entry.method);
   const levelBucket = accumulators.byLevel[criterion.level];
   if (!levelBucket) {
      throw new Error(`missing test method bucket for level ${criterion.level}`);
   }
   accumulateBucket(levelBucket, entry.method);
   accumulators.criteriaByState[entry.method].push(criterion.id);
}

export function buildSummaryTotals(input: {
   criteriaArtifact: NormalizedCriteriaArtifact;
   testMethods: Record<string, TestMethodEntry>;
}): {
   totals: ReturnType<typeof emptyBucket>;
   byLevel: Record<string, ReturnType<typeof emptyBucket>>;
   criteriaByState: Record<TestMethod, string[]>;
   withAxe: number;
   withAct: number;
   withBoth: number;
} {
   const totals = emptyBucket();
   const byLevel = initByLevel();
   const criteriaByState = initCriteriaByState();
   for (const criterion of Object.values(input.criteriaArtifact.criteria)) {
      const entry = input.testMethods[criterion.id];
      if (!entry) {
         throw new Error(`missing test method entry for ${criterion.id}`);
      }
      accumulateCriterionTestMethod(criterion, entry, {
         totals,
         byLevel,
         criteriaByState,
      });
   }
   const overlap = countToolOverlap(input);
   return { totals, byLevel, criteriaByState, ...overlap };
}
