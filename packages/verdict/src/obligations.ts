import type {
   CriterionId,
   Verdict,
   VerdictOutcome,
   StateSetupAction,
} from '@a11ied/contracts';
import { listLatestVerdicts } from './verdict-identity.js';
import { isAcceptedVerdict } from './admission-state.js';
import { resolveEvidenceProcedure } from './procedure.js';

export interface ReviewObligation {
   checkID: string;
   stateId: string;
   criterionId: CriterionId;
   outcome: VerdictOutcome | 'unassessed';
   complete: boolean;
   blocked: boolean;
}

export function getReviewCheckID(stateId: string, criterionId: CriterionId): string {
   return `${stateId}:${criterionId}`;
}

function aggregateOutcomes(verdicts: readonly Verdict[]): ReviewObligation['outcome'] {
   const outcomes = new Set(verdicts.map((verdict) => verdict.outcome));
   // Failure and uncertainty must survive additional procedure results.
   for (const outcome of [
      'failed',
      'cantTell',
      'needsReview',
      'passed',
      'inapplicable',
      'excluded',
   ] as const) {
      if (outcomes.has(outcome)) {
         return outcome;
      }
   }
   return 'unassessed';
}

/** A complete procedure is an alternative assessment, not another mandatory method. */
export function isProcedureAssessmentComplete(verdict: Verdict): boolean {
   if (
      !verdict.procedureId ||
      !verdict.assessment ||
      verdict.outcome === 'needsReview' ||
      verdict.outcome === 'cantTell'
   ) {
      return false;
   }
   try {
      const assessment = verdict.assessment,
         indices = new Set(assessment.actions.map((action) => action.index)),
         procedure = resolveEvidenceProcedure(verdict);
      return (
         assessment.version === procedure.version &&
         assessment.actions.length === procedure.actions.length &&
         assessment.actions.every((action) => action.outcome !== 'cantTell') &&
         indices.size === procedure.actions.length &&
         procedure.actions.every((_action, index) => indices.has(index))
      );
   } catch {
      return false;
   }
}

function getAssessmentProgress(
   records: readonly Verdict[],
   state: {
      stateId: string;
      targetUrl?: string | undefined;
      fingerprint?: string | undefined;
      setup?: readonly StateSetupAction[] | undefined;
   },
): {
   complete: boolean;
   blocked: boolean;
} {
   let blocked = false,
      complete = false;
   for (const record of records) {
      if (record.outcome === 'needsReview' || record.outcome === 'cantTell') {
         complete = false;
         blocked = record.outcome === 'cantTell';
      } else if (
         isAcceptedVerdict(record, state) &&
         (record.outcome === 'excluded' || isProcedureAssessmentComplete(record))
      ) {
         complete = true;
         blocked = false;
      } else if (isAcceptedVerdict(record, state) && record.outcome === 'failed') {
         complete = false;
         blocked = false;
      }
   }
   return { complete, blocked };
}

/** Derive expected checks from scope; records cannot create extra obligations. */
export function listReviewObligations(input: {
   states: readonly {
      stateId: string;
      targetUrl?: string | undefined;
      fingerprint?: string | undefined;
      setup?: readonly StateSetupAction[] | undefined;
      excluded?: boolean | undefined;
   }[];
   criterionIds: readonly CriterionId[];
   verdicts: readonly Verdict[];
}): ReviewObligation[] {
   const byCheck = new Map<string, Verdict[]>();
   for (const verdict of listLatestVerdicts(input.verdicts)) {
      const key = getReviewCheckID(verdict.stateId, verdict.criterionId),
         records = byCheck.get(key) ?? [];
      records.push(verdict);
      byCheck.set(key, records);
   }
   return input.states.flatMap((state) =>
      [...new Set(input.criterionIds)].map((criterionId) => {
         const checkID = getReviewCheckID(state.stateId, criterionId),
            records = byCheck.get(checkID) ?? [];
         const progress = getAssessmentProgress(records, state);
         return {
            checkID,
            stateId: state.stateId,
            criterionId,
            outcome: state.excluded
               ? 'excluded'
               : aggregateOutcomes(
                    progress.complete
                       ? records.filter((record) => isAcceptedVerdict(record, state))
                       : records,
                 ),
            complete: state.excluded === true || progress.complete,
            blocked: progress.blocked,
         };
      }),
   );
}
