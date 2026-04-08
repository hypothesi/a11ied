import {
   interactionPatternIdSchema,
   type CliMessage,
   type Platform,
   type VerificationCriterionResult,
   type VerificationEvidenceRecord,
   type VerificationExecutionStep,
   type VerificationUncoveredWorkItem,
} from '@a11lied/contracts';

import { runAxe } from './axe-runtime.js';
import { runInteractionPattern } from './pattern-runtime.js';
import type { showWcagCoverage } from './wcag-runtime.js';
import {
   createUncoveredWork,
   handleAxeScanError,
   handleAxeScanStep,
   handleManualReviewStep,
   handlePatternError,
   handlePatternStep,
   handleUnrecognizedProcedure,
} from './verification-helpers.js';

export interface ProcedureContext {
   criterionId: string;
   url: string;
   parsedTarget: Platform;
   wcagVersion: string;
   evidenceMode: VerificationCriterionResult['evidenceMode'];
   baseSourceReferences: VerificationCriterionResult['sourceReferences'];
   axeRuleIds: string[];
   strategyNotes: string[];
   executionSteps: VerificationExecutionStep[];
   evidence: VerificationEvidenceRecord[];
   uncoveredWork: VerificationUncoveredWorkItem[];
   errors: CliMessage[];
}

async function processAxeScanProcedure(
   ctx: ProcedureContext,
   procedureId: string,
): Promise<void> {
   try {
      const axeResult = await runAxe(ctx.url, {
         url: ctx.url,
         wcagVersion: ctx.wcagVersion,
         criterion: ctx.criterionId,
      });
      handleAxeScanStep({
         procedureId,
         criterionId: ctx.criterionId,
         baseSourceReferences: ctx.baseSourceReferences,
         axeRuleIds: ctx.axeRuleIds,
         axeResult,
         evidenceMode: ctx.evidenceMode,
         executionSteps: ctx.executionSteps,
         evidence: ctx.evidence,
      });
   } catch (error) {
      handleAxeScanError({
         procedureId,
         criterionId: ctx.criterionId,
         baseSourceReferences: ctx.baseSourceReferences,
         error,
         executionSteps: ctx.executionSteps,
         errors: ctx.errors,
      });
   }
}

async function processPatternProcedure(
   ctx: ProcedureContext,
   procedureId: string,
): Promise<void> {
   try {
      const patternResult = await runInteractionPattern({
         patternId: procedureId as Parameters<
            typeof runInteractionPattern
         >[0]['patternId'],
         url: ctx.url,
         target: ctx.parsedTarget,
      });
      handlePatternStep({
         procedureId,
         criterionId: ctx.criterionId,
         baseSourceReferences: ctx.baseSourceReferences,
         evidenceMode: ctx.evidenceMode,
         patternResult,
         executionSteps: ctx.executionSteps,
         evidence: ctx.evidence,
      });
   } catch (error) {
      handlePatternError({
         procedureId,
         criterionId: ctx.criterionId,
         baseSourceReferences: ctx.baseSourceReferences,
         evidenceMode: ctx.evidenceMode,
         error,
         executionSteps: ctx.executionSteps,
         errors: ctx.errors,
      });
   }
}

async function processSingleProcedure(
   ctx: ProcedureContext,
   procedureId: string,
): Promise<void> {
   if (procedureId === 'axe_scan') {
      return processAxeScanProcedure(ctx, procedureId);
   }

   if (procedureId === 'manual_review') {
      handleManualReviewStep({
         procedureId,
         criterionId: ctx.criterionId,
         baseSourceReferences: ctx.baseSourceReferences,
         strategyNotes: ctx.strategyNotes,
         executionSteps: ctx.executionSteps,
         evidence: ctx.evidence,
         uncoveredWork: ctx.uncoveredWork,
      });
      return;
   }

   const parsedPattern = interactionPatternIdSchema.safeParse(procedureId);
   if (parsedPattern.success) {
      return processPatternProcedure(ctx, procedureId);
   }

   handleUnrecognizedProcedure({
      procedureId,
      baseSourceReferences: ctx.baseSourceReferences,
      executionSteps: ctx.executionSteps,
      uncoveredWork: ctx.uncoveredWork,
   });
}

export function addCoverageGapWork(
   ctx: ProcedureContext,
   coverageLookup: ReturnType<typeof showWcagCoverage>,
   notes: string[],
): void {
   if (
      coverageLookup.coverage.coverageState === 'unknown' &&
      coverageLookup.strategy.procedureIds.length === 0
   ) {
      ctx.uncoveredWork.push(
         createUncoveredWork({
            kind: 'not-covered',
            message: 'No verification path is mapped for this criterion yet.',
            sourceReferences: ctx.baseSourceReferences,
         }),
      );
   }

   if (coverageLookup.strategy.requiresRealTarget && ctx.parsedTarget === 'virtual') {
      ctx.uncoveredWork.push(
         createUncoveredWork({
            kind: 'requires-real-target',
            message:
               'This criterion still needs a real assistive technology target for full confidence.',
            sourceReferences: ctx.baseSourceReferences,
         }),
      );
      notes.push(
         'The generated strategy marks this criterion as better suited to a real assistive technology target.',
      );
   }
}

async function runProceduresSequentially(
   ctx: ProcedureContext,
   procedureIds: string[],
   index: number,
): Promise<void> {
   if (index >= procedureIds.length) {
      return;
   }
   const procedureId = procedureIds[index];
   if (!procedureId) {
      return;
   }
   await processSingleProcedure(ctx, procedureId);
   return runProceduresSequentially(ctx, procedureIds, index + 1);
}

export async function collectProcedureEvidence(
   ctx: ProcedureContext,
   procedureIds: string[],
): Promise<void> {
   return runProceduresSequentially(ctx, procedureIds, 0);
}
