import type {
   EvidenceOutcome,
   EvidenceRecord,
   EvidenceStrategy,
} from '@a11ied/contracts';
import { isVerifiedEvidence, listEvidenceObligations } from './validation.js';

/** Keeps procedure coverage separate from a criterion's worst recorded outcome. */
export function getCriterionEvidence(input: {
   criterionId: string;
   records: EvidenceRecord[];
   strategy: EvidenceStrategy;
}): { pendingProcedureIds: string[]; recordedOutcome?: EvidenceOutcome } {
   const records = input.records.filter(
      (record) =>
         isVerifiedEvidence(record) &&
         record.test.kind === 'criterion' &&
         record.test.criterionId === input.criterionId,
   );
   const procedureIds = input.strategy.procedureIds.filter((id) => id !== 'axe_scan');
   const required =
      procedureIds.length === 0 && !input.strategy.coverageGap
         ? ['manual_review']
         : procedureIds;
   const pendingProcedureIds = required.filter(
      (id) =>
         new Set(records.map((record) => record.provenance?.runId)).size > 1 ||
         !records.some(
            (record) =>
               record.test.kind === 'criterion' && record.test.procedureId === id,
         ) ||
         records.some((record) =>
            listEvidenceObligations(record).some(
               (check) =>
                  check.criterionId === input.criterionId &&
                  check.procedureId === id &&
                  !records.some(
                     (candidate) => candidate.provenance?.checkId === check.checkId,
                  ),
            ),
         ),
   );
   if (input.strategy.coverageGap) {
      pendingProcedureIds.push(`coverage-gap:${input.criterionId}`);
   }
   if (records.some((record) => record.outcome === 'failed')) {
      return { pendingProcedureIds, recordedOutcome: 'failed' };
   }
   if (records.some((record) => record.outcome === 'cantTell')) {
      return { pendingProcedureIds, recordedOutcome: 'cantTell' };
   }
   if (pendingProcedureIds.length > 0 || records.length === 0) {
      return { pendingProcedureIds };
   }
   return {
      pendingProcedureIds,
      recordedOutcome: records
         .filter(
            (record) =>
               record.test.kind === 'criterion' &&
               required.includes(record.test.procedureId),
         )
         .every((record) => record.outcome === 'inapplicable')
         ? 'inapplicable'
         : 'passed',
   };
}
