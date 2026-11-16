import type { AssessmentProcedure } from '@a11ied/contracts';
import { getTestMethod, WcagEngineNotFoundError } from '@a11ied/wcag-engine';
import { CliUsageError } from './errors.js';

function readProcedureCatalog(input: {
   criterionId: string;
   wcagVersion?: string | undefined;
}): AssessmentProcedure[] {
   try {
      return getTestMethod(input.criterionId, { version: input.wcagVersion ?? '2.2' })
         .strategy.procedures;
   } catch (error) {
      if (error instanceof WcagEngineNotFoundError) {
         throw new CliUsageError(
            'validation-error',
            `WCAG criterion ${input.criterionId} was not found.`,
         );
      }
      throw error;
   }
}

/** Select a catalog procedure once for every recording surface; invented IDs are rejected. */
export function resolveEvidenceProcedure(input: {
   criterionId: string;
   procedureId?: string | undefined;
   wcagVersion?: string | undefined;
}): AssessmentProcedure {
   const procedure = readProcedureCatalog(input).find(
      (entry) =>
         entry.procedureId !== 'axe_scan' &&
         (!input.procedureId || entry.procedureId === input.procedureId),
   );
   if (!procedure) {
      throw new CliUsageError(
         'evidence-procedure-invalid',
         `No executable procedure ${input.procedureId ?? ''} exists for WCAG ${input.criterionId}.`,
      );
   }
   return procedure;
}
