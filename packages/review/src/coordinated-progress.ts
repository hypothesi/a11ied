import type { AssessmentCheck } from '@a11ied/contracts';
import {
   getAssessmentCatalog,
   getCheckEvidenceError,
   listAssessmentObligations,
} from '@a11ied/core';
import { resolveEvidenceProcedure } from '@a11ied/verdict';
import type { CoordinatedReviewScope } from './coordinator-scope.js';
import type { ScopedAssessmentResult } from '@a11ied/report';
import type { ReviewRunState } from './types.js';

export type BroaderReviewObligation = ScopedAssessmentResult;

/** State packets never claim procedures that require site or ordered journey evidence. */
export function listStateReviewCriteria(
   run: ReviewRunState,
): ReviewRunState['criterionIds'] {
   return run.criterionIds.filter(
      (criterionId) => resolveEvidenceProcedure({ criterionId }).scope === 'state',
   );
}

function getBroaderObligation(input: {
   expected: AssessmentCheck;
   scope: CoordinatedReviewScope;
}): BroaderReviewObligation {
   const { expected, scope } = input;
   const { status, records } = scope.snapshot;
   const check = status.run.checks.find((entry) => entry.checkId === expected.checkId);
   const issues = status.issues.filter((issue) => {
      if (issue.checkId) {
         return issue.checkId === expected.checkId;
      }
      if (issue.code.includes('journey') && expected.scope === 'site') {
         return false;
      }
      return !issue.criterionId || issue.criterionId === expected.criterionId;
   });
   const evidenceCurrent = check
      ? getCheckEvidenceError({ check, records }) === undefined
      : false;
   const complete =
      check?.status === 'evaluated' &&
      check.outcome !== 'cantTell' &&
      issues.length === 0 &&
      evidenceCurrent;
   if (expected.scope !== 'site' && expected.scope !== 'journey') {
      throw new Error('Expected a broader assessment obligation.');
   }
   return {
      checkId: expected.checkId,
      criterionId: expected.criterionId,
      procedureId: expected.procedureId,
      scope: expected.scope,
      environmentId: expected.environmentId,
      ...(expected.journeyId ? { journeyId: expected.journeyId } : {}),
      stateIds:
         expected.scope === 'site'
            ? status.run.states
                 .filter((state) => state.environmentId === expected.environmentId)
                 .map((state) => state.stateId)
            : expected.stateIds,
      outcome: evidenceCurrent ? (check?.outcome ?? 'unassessed') : 'unassessed',
      complete,
      reasons: issues.map((issue) => issue.message),
      evidenceIds: check?.evidenceIds ?? [],
   };
}

/** Derive units from the catalog; absent journey context remains explicitly unresolved. */
export function listBroaderReviewObligations(input: {
   run: ReviewRunState;
   scope: CoordinatedReviewScope;
}): BroaderReviewObligation[] {
   const coordinated = input.scope.snapshot.status.run;
   const expected = listAssessmentObligations(coordinated).filter(
      (check) =>
         (check.scope === 'site' || check.scope === 'journey') &&
         input.run.criterionIds.some((criterionId) => criterionId === check.criterionId),
   );
   const obligations = expected.map((check) =>
      getBroaderObligation({ expected: check, scope: input.scope }),
   );
   for (const procedure of getAssessmentCatalog(coordinated).procedures) {
      if (
         procedure.scope !== 'journey' ||
         !input.run.criterionIds.some(
            (criterionId) => criterionId === procedure.criterionId,
         )
      ) {
         continue;
      }
      const missingJourneys =
         coordinated.journeys.length > 0
            ? coordinated.journeys.filter(
                 (journey) =>
                    !expected.some(
                       (check) =>
                          check.procedureId === procedure.procedureId &&
                          check.journeyId === journey.journeyId,
                    ),
              )
            : [{ journeyId: 'missing-journey', stateIds: [] }];
      for (const journey of missingJourneys) {
         obligations.push({
            checkId: `${journey.journeyId}:${procedure.procedureId}`,
            criterionId: procedure.criterionId,
            procedureId: procedure.procedureId,
            scope: 'journey',
            journeyId: journey.journeyId,
            stateIds: journey.stateIds,
            outcome: 'unassessed',
            complete: false,
            reasons: [
               'No valid ordered journey is registered for this required procedure.',
            ],
            evidenceIds: [],
         });
      }
   }
   return obligations;
}
