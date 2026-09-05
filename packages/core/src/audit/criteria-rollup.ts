import type { AxeRunResult, WcagVersion } from '@a11ied/contracts';
import { getCoverage, listCriteriaByLevel } from '@a11ied/wcag-engine';

export interface AuditCriterionRollup {
   id: string;
   title: string;
   level: string;
   axeVerdict: 'fail' | 'pass' | 'not-covered';
   applicability: string;
   coverageState: string;
}

function listAllCriteria(
   version: WcagVersion,
): Array<{ id: string; title: string; level: string }> {
   return (['A', 'AA', 'AAA'] as const).flatMap((level) =>
      listCriteriaByLevel(level, version).criteria.map((criterion) => ({
         id: criterion.id,
         title: criterion.title,
         level: criterion.level,
      })),
   );
}

function resolveAxeVerdict(
   axeRuleIds: string[],
   axe: AxeRunResult,
): 'fail' | 'pass' | 'not-covered' {
   if (axeRuleIds.length === 0) {
      return 'not-covered';
   }
   const ruleIdSet = new Set(axeRuleIds);
   if (axe.violations.some((rule) => ruleIdSet.has(rule.id))) {
      return 'fail';
   }
   if (axe.passes.some((rule) => ruleIdSet.has(rule.id))) {
      return 'pass';
   }
   return 'not-covered';
}

/** Rolls up every WCAG criterion's axe verdict, applicability, and coverage state. */
export function buildCriteriaRollup(args: {
   version: WcagVersion;
   axe: AxeRunResult;
   applicabilityStates: Record<string, string>;
}): AuditCriterionRollup[] {
   return listAllCriteria(args.version).map((criterion) => {
      const coverage = getCoverage(criterion.id, { version: args.version });
      return {
         id: criterion.id,
         title: criterion.title,
         level: criterion.level,
         axeVerdict: resolveAxeVerdict(coverage.coverage.axeRuleIds, args.axe),
         applicability: args.applicabilityStates[criterion.id] ?? 'not-detected',
         coverageState: coverage.coverage.coverageState,
      };
   });
}
