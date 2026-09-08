import {
   axeRuleIndexArtifactSchema,
   type AxeRuleIndexArtifact,
   type WcagVersion,
} from '@a11ied/contracts';

import type { DerivedAxeRule } from '../shared/types.js';

function invertCriterionRuleIndex(
   axeRulesByCriterion: Map<string, { ruleIds: string[] }>,
): Map<string, Set<string>> {
   const criterionIdsByRule = new Map<string, Set<string>>();
   for (const [criterionId, entry] of axeRulesByCriterion.entries()) {
      for (const ruleId of entry.ruleIds) {
         const current = criterionIdsByRule.get(ruleId) ?? new Set<string>();
         current.add(criterionId);
         criterionIdsByRule.set(ruleId, current);
      }
   }
   return criterionIdsByRule;
}

/**
 * Builds the reverse axe index: every installed axe rule with the criteria it maps to.
 * Rules with no WCAG mapping (best-practice rules) are kept with an empty list so a
 * lookup by rule id still resolves. Only ids are stored; rule prose stays in axe-core.
 */
export function buildAxeRuleIndex(input: {
   version: WcagVersion;
   axeRules: DerivedAxeRule[];
   axeRulesByCriterion: Map<string, { ruleIds: string[] }>;
}): AxeRuleIndexArtifact {
   const criterionIdsByRule = invertCriterionRuleIndex(input.axeRulesByCriterion);
   const rules = Object.fromEntries(
      input.axeRules.map((rule) => [
         rule.ruleId,
         {
            ruleId: rule.ruleId,
            tags: rule.tags,
            actIds: rule.actIds,
            criterionIds: [...(criterionIdsByRule.get(rule.ruleId) ?? [])].toSorted(
               (left, right) => left.localeCompare(right, undefined, { numeric: true }),
            ),
         },
      ]),
   );
   return axeRuleIndexArtifactSchema.parse({ version: input.version, rules });
}
