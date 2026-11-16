import type {
   CriterionId,
   ScopeExclusionRule,
   TemplateGroupMetadata,
   Verdict,
} from '@a11ied/contracts';

import { computeVerdictId } from './store.js';

export interface TemplateStateDescriptor {
   stateId: string;
   targetUrl: string;
   templateGroup?: TemplateGroupMetadata | undefined;
   fingerprint?: string | undefined;
}

export type ObligationKind = 'criterion_check' | 'axe_scan' | 'template_smoke';

export interface StateObligation {
   id: string;
   stateId: string;
   targetUrl: string;
   kind: ObligationKind;
   criterionId?: CriterionId | undefined;
   representativeStateId?: string | undefined;
   templateGroupId?: string | undefined;
   status: 'pending' | 'passed' | 'failed' | 'stale' | 'excluded';
   exclusionReason?: string | undefined;
}

function hasFilters(rule: ScopeExclusionRule): boolean {
   const criterionLength = rule.criterionIds?.length ?? 0,
      selectorLength = rule.selectors?.length ?? 0,
      stateLength = rule.stateIds?.length ?? 0,
      urlLength = rule.urlPatterns?.length ?? 0;

   return stateLength > 0 || criterionLength > 0 || urlLength > 0 || selectorLength > 0;
}

function stateIdMatches(rule: ScopeExclusionRule, input: { stateId: string }): boolean {
   return rule.stateIds?.includes(input.stateId) ?? true;
}

function criterionMatches(
   rule: ScopeExclusionRule,
   criterionId: CriterionId | undefined,
): boolean {
   if (!rule.criterionIds?.length) {
      return true;
   }

   return criterionId !== undefined && rule.criterionIds.includes(criterionId);
}

function selectorMatches(
   rule: ScopeExclusionRule,
   selector: string | undefined,
): boolean {
   if (!rule.selectors?.length) {
      return true;
   }

   return selector !== undefined && rule.selectors.includes(selector);
}

function urlPatternsMatch(targetUrl: string, patterns: readonly string[]): boolean {
   return patterns.some((pattern) => {
      try {
         return targetUrl.includes(pattern) || new RegExp(pattern).test(targetUrl);
      } catch {
         return targetUrl.includes(pattern);
      }
   });
}

function urlMatches(rule: ScopeExclusionRule, targetUrl: string): boolean {
   return rule.urlPatterns?.length ? urlPatternsMatch(targetUrl, rule.urlPatterns) : true;
}

function ruleMatches(
   rule: ScopeExclusionRule,
   input: {
      stateId: string;
      targetUrl: string;
      criterionId?: CriterionId;
      selector?: string;
   },
): boolean {
   if (!hasFilters(rule)) {
      return false;
   }

   return (
      stateIdMatches(rule, input) &&
      criterionMatches(rule, input.criterionId) &&
      urlMatches(rule, input.targetUrl) &&
      selectorMatches(rule, input.selector)
   );
}

export function matchScopeExclusion(
   input: {
      stateId: string;
      targetUrl: string;
      criterionId?: CriterionId;
      selector?: string;
   },
   rules: readonly ScopeExclusionRule[],
): ScopeExclusionRule | undefined {
   return rules.find((rule) => ruleMatches(rule, input));
}

export function listExcludedSelectors(input: {
   state: { stateId: string; targetUrl: string };
   exclusions: readonly ScopeExclusionRule[];
}): string[] {
   return [
      ...new Set(
         input.exclusions.flatMap((rule) =>
            (rule.selectors ?? []).filter(
               (selector) =>
                  matchScopeExclusion({ ...input.state, selector }, [rule]) !== undefined,
            ),
         ),
      ),
   ].toSorted();
}

function isStateLevelExclusion(rule: ScopeExclusionRule | undefined): boolean {
   if (!rule) {
      return false;
   }

   return !rule.criterionIds?.length && !rule.selectors?.length;
}

function markExcluded(
   obligations: readonly StateObligation[],
   stateId: string,
   exclusionReason: string,
): StateObligation[] {
   return obligations.map((obligation) =>
      obligation.stateId === stateId && obligation.status !== 'excluded'
         ? { ...obligation, status: 'excluded', exclusionReason }
         : obligation,
   );
}

function buildMemberObligations(state: TemplateStateDescriptor): StateObligation[] {
   const groupId = state.templateGroup?.templateGroupId,
      repId = state.templateGroup?.representativeStateId;

   return [
      {
         id: `${state.stateId}:axe_scan`,
         stateId: state.stateId,
         targetUrl: state.targetUrl,
         kind: 'axe_scan',
         status: 'pending',
      },
      {
         id: `${state.stateId}:template_smoke`,
         stateId: state.stateId,
         targetUrl: state.targetUrl,
         kind: 'template_smoke',
         representativeStateId: repId,
         templateGroupId: groupId,
         status: 'pending',
      },
   ];
}

function buildRepresentativeObligations(
   state: TemplateStateDescriptor,
   criterionIds: readonly CriterionId[],
   exclusions: readonly ScopeExclusionRule[],
): StateObligation[] {
   const obligations: StateObligation[] = [
      {
         id: `${state.stateId}:axe_scan`,
         stateId: state.stateId,
         targetUrl: state.targetUrl,
         kind: 'axe_scan',
         status: 'pending',
      },
   ];

   for (const criterionId of criterionIds) {
      const excluded = matchScopeExclusion(
         { stateId: state.stateId, targetUrl: state.targetUrl, criterionId },
         exclusions,
      );

      obligations.push({
         id: `${state.stateId}:criterion_check:${criterionId}`,
         stateId: state.stateId,
         targetUrl: state.targetUrl,
         kind: 'criterion_check',
         criterionId,
         status: excluded ? 'excluded' : 'pending',
         exclusionReason: excluded?.reason,
      });
   }

   return obligations;
}

export function expandStateObligations(
   states: readonly TemplateStateDescriptor[],
   criterionIds: readonly CriterionId[],
   exclusions: readonly ScopeExclusionRule[] = [],
): StateObligation[] {
   const obligations: StateObligation[] = [];

   for (const state of states) {
      const stateLevelExclusion = matchScopeExclusion(
         { stateId: state.stateId, targetUrl: state.targetUrl },
         exclusions,
      );
      if (isStateLevelExclusion(stateLevelExclusion)) {
         obligations.splice(
            0,
            obligations.length,
            ...markExcluded(
               obligations,
               state.stateId,
               stateLevelExclusion?.reason ?? '',
            ),
         );
         continue;
      }

      const obligationsForState: StateObligation[] =
         state.templateGroup?.memberRole === 'member'
            ? buildMemberObligations(state)
            : buildRepresentativeObligations(state, criterionIds, exclusions);

      obligations.push(...obligationsForState);
   }

   return obligations;
}

export function revokeStaleMemberObligations(
   obligations: readonly StateObligation[],
   previousRepresentativeFingerprints: Readonly<Record<string, string>>,
   currentRepresentativeFingerprints: Readonly<Record<string, string>>,
): StateObligation[] {
   return obligations.map((obligation) => {
      if (obligation.kind !== 'template_smoke' || !obligation.representativeStateId) {
         return obligation;
      }

      const currentFingerprint =
            currentRepresentativeFingerprints[obligation.representativeStateId],
         previousFingerprint =
            previousRepresentativeFingerprints[obligation.representativeStateId];

      if (
         previousFingerprint === undefined ||
         currentFingerprint === undefined ||
         previousFingerprint === currentFingerprint
      ) {
         return obligation;
      }

      return { ...obligation, status: 'stale' };
   });
}

export function createExclusionVerdict(input: {
   stateId: string;
   criterionId: CriterionId;
   rule: ScopeExclusionRule;
   recordedAt?: string;
}): Verdict {
   return {
      id: computeVerdictId({ criterionId: input.criterionId, stateId: input.stateId }),
      criterionId: input.criterionId,
      stateId: input.stateId,
      tier: 0,
      outcome: 'excluded',
      confidence: 1,
      method: 'scope-exclusion',
      rationale: `Excluded by scope rule ${input.rule.ruleId}: ${input.rule.reason}`,
      exclusionReason: input.rule.reason,
      evidence: [],
      repro: [],
      recordedAt: input.recordedAt ?? new Date().toISOString(),
   };
}
