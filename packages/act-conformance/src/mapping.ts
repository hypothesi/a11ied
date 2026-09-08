import { getAxeRule } from '@a11ied/wcag-engine';
import axe from 'axe-core';

/**
 * ACT rules axe-core names in its `actIds` but which have no test cases. Both are
 * deprecated ACT rules. Listing them keeps a future drop in test case coverage from
 * looking like a mapping bug.
 */
export const ACT_RULES_WITHOUT_TEST_CASES = ['3ea0c8', '5b7ae0'];

export interface AxeActPair {
   axeRuleId: string;
   actRuleId: string;
}

/**
 * Every axe rule that claims an ACT rule, paired with the rule it claims.
 *
 * Read straight from axe-core rather than the generated artifacts so a bump to axe-core
 * cannot silently drop a pair. The run selects these rule ids explicitly: a criterion
 * driven selection would miss `empty-heading`, which is tagged `best-practice` with no
 * success criterion, and would take ACT rule `ffd0e9` and its 15 test cases with it.
 */
function readActIds(axeRuleId: string): string[] {
   try {
      return getAxeRule(axeRuleId).rule.actIds;
   } catch {
      return [];
   }
}

function comparePairs(left: AxeActPair, right: AxeActPair): number {
   return (
      left.actRuleId.localeCompare(right.actRuleId) ||
      left.axeRuleId.localeCompare(right.axeRuleId)
   );
}

export function listAxeActPairs(): AxeActPair[] {
   return axe
      .getRules()
      .flatMap((rule) =>
         readActIds(rule.ruleId).map((actRuleId) => ({
            axeRuleId: rule.ruleId,
            actRuleId,
         })),
      )
      .toSorted(comparePairs);
}

/** The axe rule ids the run scans with, in a stable order. */
export function listScannedAxeRuleIds(pairs: AxeActPair[]): string[] {
   return [...new Set(pairs.map((pair) => pair.axeRuleId))].toSorted();
}

/** The axe rules that claim one ACT rule. Several rules can claim the same one. */
export function listAxeRulesForActRule(pairs: AxeActPair[], actRuleId: string): string[] {
   return pairs
      .filter((pair) => pair.actRuleId === actRuleId)
      .map((pair) => pair.axeRuleId);
}
