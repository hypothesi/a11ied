import type { ActRuleStatus, NormalizedCriteriaArtifact } from '@a11ied/contracts';

import type {
   ActMappingPayload,
   ActRulePayload,
   DerivedAxeRule,
} from '../shared/types.js';

function parseActRuleId(rule: ActRulePayload): string | undefined {
   if (
      typeof rule.frontmatter?.id === 'string' &&
      rule.frontmatter.id.trim().length > 0
   ) {
      return rule.frontmatter.id.trim();
   }
   const permalinkMatch = rule.permalink?.match(/\/([a-z0-9]+)\/?$/i);
   return permalinkMatch?.[1];
}

function criterionIdsBySlug(
   criteriaArtifact: NormalizedCriteriaArtifact,
): Map<string, string> {
   return new Map(
      Object.values(criteriaArtifact.criteria).map((cr) => [cr.slug, cr.id] as const),
   );
}

function criterionIdsByFlatNumber(
   criteriaArtifact: NormalizedCriteriaArtifact,
): Map<string, string> {
   return new Map(
      Object.values(criteriaArtifact.criteria).map(
         (cr) => [cr.id.replaceAll('.', ''), cr.id] as const,
      ),
   );
}

function requirementKeyToCriterionId(
   requirementKey: string,
   criterionIds: Set<string>,
): string | undefined {
   const candidate = requirementKey.split(':').at(-1);
   if (!candidate) {
      return undefined;
   }
   if (criterionIds.has(candidate)) {
      return candidate;
   }
   return undefined;
}

/**
 * The criteria a rule lists as secondary. The rule does not decide those: "Text has
 * enhanced contrast" names 1.4.3 as secondary because its failures may still satisfy the
 * lower AA threshold. The mapping's `successCriteria` list includes them anyway, so they
 * are read from the frontmatter and dropped from both sources.
 */
function listSecondaryCriterionIds(input: {
   rule: ActRulePayload;
   criterionIds: Set<string>;
}): Set<string> {
   const secondary = new Set<string>();
   for (const [key, requirement] of Object.entries(
      input.rule.frontmatter?.accessibility_requirements ?? {},
   )) {
      const cid = requirementKeyToCriterionId(key, input.criterionIds);
      if (cid && requirement.secondary !== undefined) {
         secondary.add(cid);
      }
   }
   return secondary;
}

function mapRuleCriteria(input: {
   rule: ActRulePayload;
   slugToId: Map<string, string>;
   criterionIds: Set<string>;
}): Set<string> {
   const secondary = listSecondaryCriterionIds(input);
   const mapped = new Set<string>();
   for (const slug of input.rule.successCriteria ?? []) {
      const cid = input.slugToId.get(slug);
      if (cid && !secondary.has(cid)) {
         mapped.add(cid);
      }
   }
   for (const rk of Object.keys(
      input.rule.frontmatter?.accessibility_requirements ?? {},
   )) {
      const cid = requirementKeyToCriterionId(rk, input.criterionIds);
      if (cid && !secondary.has(cid)) {
         mapped.add(cid);
      }
   }
   return mapped;
}

function addRuleToActIndex(
   actRuleId: string,
   mappedIds: Set<string>,
   index: Map<string, Set<string>>,
): void {
   for (const criterionId of mappedIds) {
      const current = index.get(criterionId) ?? new Set<string>();
      current.add(actRuleId);
      index.set(criterionId, current);
   }
}

export interface IdentifiedActRule {
   ruleId: string;
   status: ActRuleStatus;
   rule: ActRulePayload;
}

function actRuleStatus(rule: ActRulePayload): ActRuleStatus {
   if (rule.deprecated) {
      return 'deprecated';
   }
   return rule.proposed ? 'proposed' : 'published';
}

/**
 * Every rule in the ACT mapping paired with the six-character id it is known by, dropping
 * only an entry whose id can be read from neither its frontmatter nor its permalink.
 * Proposed and deprecated rules stay in the list: coverage ignores them, but they still
 * need a title and a URL so an id printed anywhere resolves to a name.
 */
export function listIdentifiedActRules(
   actMapping: ActMappingPayload,
): IdentifiedActRule[] {
   return actMapping['act-rules'].flatMap((rule) => {
      const ruleId = parseActRuleId(rule);
      if (!ruleId) {
         return [];
      }
      return [{ ruleId, status: actRuleStatus(rule), rule }];
   });
}

export function buildActRulesByCriterion(input: {
   criteriaArtifact: NormalizedCriteriaArtifact;
   actMapping: ActMappingPayload;
}): Map<string, string[]> {
   const criterionIds = new Set(Object.keys(input.criteriaArtifact.criteria));
   const slugToId = criterionIdsBySlug(input.criteriaArtifact);
   const index = new Map<string, Set<string>>();
   for (const identified of listIdentifiedActRules(input.actMapping)) {
      if (identified.status !== 'published') {
         continue;
      }
      addRuleToActIndex(
         identified.ruleId,
         mapRuleCriteria({ rule: identified.rule, slugToId, criterionIds }),
         index,
      );
   }
   return new Map(
      [...index.entries()].map(([cid, ids]) => [
         cid,
         [...ids].toSorted((left, right) => left.localeCompare(right)),
      ]),
   );
}

export function invertActIndex(
   actRulesByCriterion: Map<string, string[]>,
): Map<string, Set<string>> {
   const inverted = new Map<string, Set<string>>();
   for (const [criterionId, actRuleIds] of actRulesByCriterion.entries()) {
      for (const actRuleId of actRuleIds) {
         const current = inverted.get(actRuleId) ?? new Set<string>();
         current.add(criterionId);
         inverted.set(actRuleId, current);
      }
   }
   return inverted;
}

function mapAxeRuleToTag(tag: string, flatMap: Map<string, string>): string | undefined {
   const match = /^wcag(\d+)$/.exec(tag);
   if (!match) {
      return undefined;
   }
   const flatId = match[1];
   if (!flatId) {
      return undefined;
   }
   return flatMap.get(flatId);
}

function collectAxeTagMappings(input: {
   rule: DerivedAxeRule;
   flatMap: Map<string, string>;
}): { ids: Set<string>; usedTag: boolean } {
   const ids = new Set<string>();
   let usedTag = false;
   for (const tag of input.rule.tags) {
      const cid = mapAxeRuleToTag(tag, input.flatMap);
      if (cid) {
         ids.add(cid);
         usedTag = true;
      }
   }
   return { ids, usedTag };
}

function collectAxeActMappings(input: {
   rule: DerivedAxeRule;
   actRuleToCriteria: Map<string, Set<string>>;
}): { ids: Set<string>; usedAct: boolean } {
   const ids = new Set<string>();
   let usedAct = false;
   for (const actId of input.rule.actIds) {
      for (const cid of input.actRuleToCriteria.get(actId) ?? []) {
         ids.add(cid);
         usedAct = true;
      }
   }
   return { ids, usedAct };
}

function addAxeRuleToIndex(input: {
   rule: DerivedAxeRule;
   criterionIds: Set<string>;
   usedTag: boolean;
   usedAct: boolean;
   index: Map<string, { ruleIds: Set<string>; sourceAttribution: Set<string> }>;
}): void {
   for (const criterionId of input.criterionIds) {
      const current = input.index.get(criterionId) ?? {
         ruleIds: new Set<string>(),
         sourceAttribution: new Set<string>(),
      };
      current.ruleIds.add(input.rule.ruleId);
      if (input.usedTag) {
         current.sourceAttribution.add('axe-rule-tags');
      }
      if (input.usedAct) {
         current.sourceAttribution.add('axe-act-id-join');
      }
      input.index.set(criterionId, current);
   }
}

export function buildAxeRulesByCriterion(input: {
   criteriaArtifact: NormalizedCriteriaArtifact;
   actRulesByCriterion: Map<string, string[]>;
   axeRules: DerivedAxeRule[];
}): Map<string, { ruleIds: string[]; sourceAttribution: string[] }> {
   const flatMap = criterionIdsByFlatNumber(input.criteriaArtifact);
   const actRuleToCriteria = invertActIndex(input.actRulesByCriterion);
   const index = new Map<
      string,
      { ruleIds: Set<string>; sourceAttribution: Set<string> }
   >();
   for (const rule of input.axeRules) {
      const tagResult = collectAxeTagMappings({ rule, flatMap });
      const actResult = collectAxeActMappings({ rule, actRuleToCriteria });
      const allIds = new Set([...tagResult.ids, ...actResult.ids]);
      addAxeRuleToIndex({
         rule,
         criterionIds: allIds,
         usedTag: tagResult.usedTag,
         usedAct: actResult.usedAct,
         index,
      });
   }
   return new Map(
      [...index.entries()].map(([cid, val]) => [
         cid,
         {
            ruleIds: [...val.ruleIds].toSorted((left, right) =>
               left.localeCompare(right),
            ),
            sourceAttribution: [...val.sourceAttribution].toSorted((left, right) =>
               left.localeCompare(right),
            ),
         },
      ]),
   );
}
