import type { AxeRunResult, WcagLevel, WcagVersion } from '@a11ied/contracts';
import { getTestMethod, listCriteriaByLevel } from '@a11ied/wcag-engine';

/** What a one-page check knows about one success criterion. */
export interface CheckCriterion {
   id: string;
   title: string;
   level: string;
   axeVerdict: 'fail' | 'pass' | 'incomplete' | 'not-covered';
   relevance: string;
   /** `automated`, `hybrid`, or `manual`, from the WCAG test-method artifact. */
   testMethod: string;
   /**
    * True unless axe found a failure. A scanner pass never settles a criterion, so every
    * other criterion still needs a person or an agent to judge it, in an `a1 audit`.
    */
   needsJudgment: boolean;
}

function listAllCriteria(
   version: WcagVersion,
   maxLevel: WcagLevel = 'AAA',
): Array<{ id: string; title: string; level: string }> {
   const levels = ['A', 'AA', 'AAA'] as const;
   const included = levels.slice(0, levels.indexOf(maxLevel) + 1);
   return included.flatMap((level) =>
      listCriteriaByLevel(level, version).criteria.map((criterion) => ({
         id: criterion.id,
         title: criterion.title,
         level: criterion.level,
      })),
   );
}

function resolveAxeVerdict(
   axeRuleIds: string[],
   axe: AxeRunResult | undefined,
): CheckCriterion['axeVerdict'] {
   if (!axe || axeRuleIds.length === 0) {
      return 'not-covered';
   }
   const ruleIdSet = new Set(axeRuleIds);
   if (axe.violations.some((rule) => ruleIdSet.has(rule.id))) {
      return 'fail';
   }
   if (axe.incomplete.some((rule) => ruleIdSet.has(rule.id))) {
      return 'incomplete';
   }
   const checked = new Set([...axe.passes, ...axe.inapplicable].map((rule) => rule.id));
   if (axeRuleIds.every((id) => checked.has(id))) {
      return 'pass';
   }
   return 'not-covered';
}

/** What a scan alone can say about a criterion. It can never say `passed`. */
export type CheckOutcome = 'failed' | 'cantTell' | 'notTested';

/** A passing scanner rule never establishes a whole criterion's outcome. */
export function getCriterionOutcome(criterion: CheckCriterion): CheckOutcome {
   if (criterion.axeVerdict === 'fail') {
      return 'failed';
   }
   if (criterion.axeVerdict === 'incomplete') {
      return 'cantTell';
   }
   return 'notTested';
}

/** Rolls up every WCAG criterion's axe verdict, relevance, and test method for one page. */
export function buildCriteriaRollup(args: {
   version: WcagVersion;
   level?: WcagLevel | undefined;
   axe?: AxeRunResult;
   relevanceStates: Record<string, string>;
}): CheckCriterion[] {
   return listAllCriteria(args.version, args.level).map((criterion) => {
      const { testMethod } = getTestMethod(criterion.id, { version: args.version });
      const axeVerdict = resolveAxeVerdict(testMethod.axeRuleIds, args.axe);
      return {
         id: criterion.id,
         title: criterion.title,
         level: criterion.level,
         axeVerdict,
         relevance: args.relevanceStates[criterion.id] ?? 'not-detected',
         testMethod: testMethod.method,
         needsJudgment: axeVerdict !== 'fail',
      };
   });
}
