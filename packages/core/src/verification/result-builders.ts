import {
   verificationCriterionResultSchema,
   verificationExecutionPlanSchema,
   type CliMessage,
   type VerificationCriterionResult,
   type VerificationEvidenceMode,
   type VerificationEvidenceRecord,
   type VerificationExecutionStep,
   type VerificationSourceReference,
   type VerificationUncoveredWorkItem,
} from '@a11ied/contracts';

import { createStrategyId } from './strategy.js';

interface VerificationResultArgs {
   criterion: VerificationCriterionResult['criterion'];
   applicabilityAssessment: VerificationCriterionResult['applicability'];
   coverageLookup: {
      coverage: VerificationCriterionResult['coverage'];
      strategy: VerificationCriterionResult['strategy'];
   };
   evidenceMode: VerificationEvidenceMode;
   evidence: VerificationEvidenceRecord[];
   executionSteps: VerificationExecutionStep[];
   uncoveredWork: VerificationUncoveredWorkItem[];
   notes: string[];
   errors: CliMessage[];
   baseSourceReferences: VerificationSourceReference[];
}

function buildExecutionPlan(
   args: VerificationResultArgs,
   procedureIds: string[],
): unknown {
   return verificationExecutionPlanSchema.parse({
      strategyId: createStrategyId(args.criterion.wcagVersion, args.criterion.id),
      preferredEvidenceMode: args.evidenceMode,
      selectedProcedureIds: procedureIds,
      steps: args.executionSteps,
   });
}

export function buildNotApplicableResult(
   args: VerificationResultArgs,
): VerificationCriterionResult {
   return verificationCriterionResultSchema.parse({
      criterionId: args.criterion.id,
      criterion: args.criterion,
      applicability: args.applicabilityAssessment,
      coverage: args.coverageLookup.coverage,
      strategy: args.coverageLookup.strategy,
      executionPlan: buildExecutionPlan(args, []),
      verdict: 'not-applicable',
      evidenceMode: args.evidenceMode,
      procedureIds: [],
      evidence: args.evidence,
      sourceReferences: args.baseSourceReferences,
      uncoveredWork: args.uncoveredWork,
      notes: [...args.notes, 'The criterion did not look applicable for this target.'],
      errors: args.errors,
   });
}

export function buildFinalResult(
   args: VerificationResultArgs & {
      verdict: VerificationCriterionResult['verdict'];
   },
): VerificationCriterionResult {
   const procedureIds = args.coverageLookup.strategy.procedureIds;
   return verificationCriterionResultSchema.parse({
      criterionId: args.criterion.id,
      criterion: args.criterion,
      applicability: args.applicabilityAssessment,
      coverage: args.coverageLookup.coverage,
      strategy: args.coverageLookup.strategy,
      executionPlan: buildExecutionPlan(args, procedureIds),
      verdict: args.verdict,
      evidenceMode: args.evidenceMode,
      procedureIds,
      evidence: args.evidence,
      sourceReferences: args.baseSourceReferences,
      uncoveredWork: args.uncoveredWork,
      notes: args.notes,
      errors: args.errors,
   });
}
