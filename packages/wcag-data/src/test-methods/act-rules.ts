import {
   actRuleIndexArtifactSchema,
   type ActRuleIndexArtifact,
   type WcagVersion,
} from '@a11ied/contracts';

import type { ActMappingPayload } from '../shared/types.js';
import { invertActIndex, listIdentifiedActRules } from './indexing.js';

/**
 * Permalinks in the mapping are relative to the WAI section of the W3C site, such as
 * `/standards-guidelines/act/rules/5f99a7/`, so a rule's page is that path under this
 * prefix. Joining against `https://www.w3.org` alone drops `/WAI` and lands on a 404.
 */
const ACT_RULE_URL_PREFIX = 'https://www.w3.org/WAI';

/**
 * Builds the ACT rule index: the name and W3C page behind each six-character rule id,
 * with the criteria the rule covers. Proposed and deprecated rules are kept with an empty
 * criterion list, the way `buildAxeRuleIndex` keeps best-practice axe rules, because
 * axe-core cites their ids and a lookup by id still has to resolve. Only the title and
 * the link are stored; the rule's own text stays on the W3C site.
 */
export function buildActRuleIndex(input: {
   version: WcagVersion;
   actMapping: ActMappingPayload;
   actCoverageIndex: Map<string, string[]>;
}): ActRuleIndexArtifact {
   const criterionIdsByRule = invertActIndex(input.actCoverageIndex);
   const rules = Object.fromEntries(
      listIdentifiedActRules(input.actMapping).flatMap((identified) => {
         if (!identified.rule.permalink) {
            return [];
         }
         return [
            [
               identified.ruleId,
               {
                  ruleId: identified.ruleId,
                  title: identified.rule.title,
                  url: `${ACT_RULE_URL_PREFIX}${identified.rule.permalink}`,
                  status: identified.status,
                  criterionIds: [
                     ...(criterionIdsByRule.get(identified.ruleId) ?? []),
                  ].toSorted((left, right) =>
                     left.localeCompare(right, undefined, { numeric: true }),
                  ),
               },
            ] as const,
         ];
      }),
   );
   return actRuleIndexArtifactSchema.parse({ version: input.version, rules });
}
