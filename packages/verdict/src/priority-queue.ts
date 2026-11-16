import type {
   CriterionId,
   EvaluationTier,
   PageVerdict,
   Verdict,
   VerdictImpact,
} from '@a11ied/contracts';

import { WCAG_22_AA_CRITERIA } from './criteria.js';
import { listReviewObligations } from './obligations.js';
import { computePageVerdicts } from './store.js';

export const IMPACT_RANK: Readonly<Record<VerdictImpact, number>> = {
   critical: 0,
   serious: 1,
   moderate: 2,
   minor: 3,
};

export const DEFAULT_CRITERION_IMPACT: Readonly<Record<string, VerdictImpact>> = {
   '1.1.1': 'critical',
   '1.2.1': 'critical',
   '1.2.2': 'critical',
   '1.3.1': 'critical',
   '2.1.1': 'critical',
   '2.1.2': 'critical',
   '2.3.1': 'critical',
   '3.3.1': 'critical',
   '3.3.2': 'critical',
   '4.1.2': 'critical',
   '1.2.3': 'serious',
   '1.2.5': 'serious',
   '1.3.4': 'serious',
   '1.3.5': 'serious',
   '1.4.1': 'serious',
   '1.4.2': 'serious',
   '1.4.3': 'serious',
   '1.4.4': 'serious',
   '1.4.10': 'serious',
   '1.4.11': 'serious',
   '1.4.12': 'serious',
   '1.4.13': 'serious',
   '2.1.4': 'serious',
   '2.2.1': 'serious',
   '2.2.2': 'serious',
   '2.4.1': 'serious',
   '2.4.2': 'serious',
   '2.4.3': 'serious',
   '2.4.4': 'serious',
   '2.4.6': 'serious',
   '2.4.7': 'serious',
   '2.4.11': 'serious',
   '2.5.1': 'serious',
   '2.5.2': 'serious',
   '2.5.3': 'serious',
   '2.5.7': 'serious',
   '2.5.8': 'serious',
   '3.1.1': 'serious',
   '3.2.1': 'serious',
   '3.2.2': 'serious',
   '3.3.3': 'serious',
   '3.3.4': 'serious',
   '3.3.7': 'serious',
   '3.3.8': 'serious',
   '4.1.3': 'serious',
   '1.2.4': 'moderate',
   '1.3.2': 'moderate',
   '1.3.3': 'moderate',
   '1.4.5': 'moderate',
   '2.4.5': 'moderate',
   '2.5.4': 'moderate',
   '3.1.2': 'moderate',
   '3.2.3': 'moderate',
   '3.2.4': 'moderate',
   '3.2.6': 'moderate',
};

export function getCriterionImpact(
   criterionId: CriterionId,
   explicitImpact?: VerdictImpact,
): VerdictImpact {
   return explicitImpact ?? DEFAULT_CRITERION_IMPACT[criterionId] ?? 'moderate';
}

export interface ClaimableWorkItem {
   id: string;
   stateId: string;
   statePriority?: number;
   criterionId: CriterionId;
   procedureId?: string;
   impact?: VerdictImpact;
   tier?: EvaluationTier;
}

const DEFAULT_STATE_PRIORITY = 0;

export function compareClaimableWork(
   left: ClaimableWorkItem,
   right: ClaimableWorkItem,
): number {
   const statePriorityDiff =
      (left.statePriority ?? DEFAULT_STATE_PRIORITY) -
      (right.statePriority ?? DEFAULT_STATE_PRIORITY);
   if (statePriorityDiff !== 0) {
      return statePriorityDiff;
   }

   const impactRankDiff =
      IMPACT_RANK[getCriterionImpact(left.criterionId, left.impact)] -
      IMPACT_RANK[getCriterionImpact(right.criterionId, right.impact)];
   if (impactRankDiff !== 0) {
      return impactRankDiff;
   }

   const criterionDiff = left.criterionId.localeCompare(right.criterionId, undefined, {
      numeric: true,
   });
   if (criterionDiff !== 0) {
      return criterionDiff;
   }

   return (left.procedureId ?? '').localeCompare(right.procedureId ?? '');
}

export function sortClaimableWork<TItem extends ClaimableWorkItem>(
   items: readonly TItem[],
): TItem[] {
   return [...items].toSorted(compareClaimableWork);
}

export function buildQueueSnapshot(input: {
   states: readonly { stateId: string; targetUrl: string; excluded?: boolean }[];
   verdicts: readonly Verdict[];
   pendingWork: readonly ClaimableWorkItem[];
   criterionIds?: readonly CriterionId[];
}): {
   nextBatch: ClaimableWorkItem[];
   pageVerdicts: PageVerdict[];
   canRenderDraftReport: boolean;
   unresolvedCount: number;
} {
   const sorted = sortClaimableWork(input.pendingWork);
   const criterionIds = input.criterionIds ?? WCAG_22_AA_CRITERIA;
   const obligations = listReviewObligations({ ...input, criterionIds });
   const pageVerdicts = computePageVerdicts(input.states, input.verdicts, criterionIds);

   return {
      nextBatch: sorted,
      pageVerdicts,
      // Draft reports must render at any point in the run, not only at 100% completion (P0-5).
      canRenderDraftReport: true,
      unresolvedCount: obligations.filter((check) => !check.complete).length,
   };
}
