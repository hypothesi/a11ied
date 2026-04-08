import type {
   CliMessage,
   CriterionLookupKey,
   Platform,
   VerificationCriterionResult,
   VerificationReport,
} from '@a11lied/contracts';

import { inspectCriterionUrl, showWcagCoverage } from '../wcag/runtime.js';
import {
   buildFinalResult,
   buildNotApplicableResult,
   buildTarget,
   createApplicabilityEvidence,
   createBaseSourceReferences,
   createVerificationMessage,
   deriveVerdict,
   isApplicable,
} from './helpers.js';
import {
   addCoverageGapWork,
   collectProcedureEvidence,
   type ProcedureContext,
} from './procedure-runner.js';

export interface VerifyCriterionResultOutput {
   criterion: VerificationCriterionResult;
   warning: CliMessage | undefined;
   target: VerificationReport['target'];
}

interface VerificationContextResult {
   coverageLookup: ReturnType<typeof showWcagCoverage>;
   applicabilityLookup: Awaited<ReturnType<typeof inspectCriterionUrl>>;
   ctx: ProcedureContext;
   notes: string[];
   target: VerificationReport['target'];
}

function buildInitialProcedureContext(args: {
   criterion: { id: string; title: string; wcagVersion: string };
   url: string;
   parsedTarget: Platform;
   evidenceMode: ReturnType<typeof showWcagCoverage>['strategy']['preferredEvidenceMode'];
   baseRefs: ReturnType<typeof createBaseSourceReferences>;
   coverageLookup: ReturnType<typeof showWcagCoverage>;
   assessment: Awaited<ReturnType<typeof inspectCriterionUrl>>['assessment'];
}): ProcedureContext {
   return {
      criterionId: args.criterion.id,
      url: args.url,
      parsedTarget: args.parsedTarget,
      wcagVersion: args.criterion.wcagVersion,
      evidenceMode: args.evidenceMode,
      baseSourceReferences: args.baseRefs,
      axeRuleIds: args.coverageLookup.coverage.axeRuleIds,
      strategyNotes: args.coverageLookup.strategy.notes,
      executionSteps: [
         {
            procedureId: `applicability:${args.criterion.id}`,
            kind: 'applicability',
            mode: args.evidenceMode,
            status: 'completed',
            sourceReferences: args.baseRefs,
         },
      ],
      evidence: [
         createApplicabilityEvidence({
            criterionId: args.criterion.id,
            criterionTitle: args.criterion.title,
            evidenceMode: args.evidenceMode,
            assessment: args.assessment,
            sourceReferences: args.baseRefs,
         }),
      ],
      uncoveredWork: [],
      errors: [],
   };
}

async function buildVerificationContext(args: {
   criterion: CriterionLookupKey;
   url: string;
   parsedTarget: Platform;
   wcagVersion: string;
}): Promise<VerificationContextResult> {
   const coverageLookup = showWcagCoverage(args.criterion, args.wcagVersion);
   const applicabilityLookup = await inspectCriterionUrl(
      coverageLookup.criterion.id,
      args.url,
      args.wcagVersion,
   );
   const criterion = applicabilityLookup.criterion;
   const baseRefs = createBaseSourceReferences(
      criterion.id,
      criterion.title,
      criterion.wcagVersion,
   );
   const evidenceMode = coverageLookup.strategy.preferredEvidenceMode;

   return {
      coverageLookup,
      applicabilityLookup,
      ctx: buildInitialProcedureContext({
         criterion,
         url: args.url,
         parsedTarget: args.parsedTarget,
         evidenceMode,
         baseRefs,
         coverageLookup,
         assessment: applicabilityLookup.assessment,
      }),
      notes: [...coverageLookup.strategy.notes],
      target: buildTarget(args.url, args.parsedTarget),
   };
}

function buildOutputFromResult(args: {
   result: VerificationCriterionResult;
   criterionId: string;
   target: VerificationReport['target'];
}): VerifyCriterionResultOutput {
   return {
      criterion: args.result,
      warning: createVerificationMessage(args.criterionId, args.result.verdict),
      target: args.target,
   };
}

function buildResultArgs(vctx: VerificationContextResult): {
   criterion: VerificationCriterionResult['criterion'];
   applicabilityAssessment: VerificationCriterionResult['applicability'];
   coverageLookup: VerificationCriterionResult['coverage'] extends infer _T
      ? VerificationContextResult['coverageLookup']
      : never;
   evidenceMode: ProcedureContext['evidenceMode'];
   evidence: ProcedureContext['evidence'];
   executionSteps: ProcedureContext['executionSteps'];
   uncoveredWork: ProcedureContext['uncoveredWork'];
   notes: string[];
   errors: ProcedureContext['errors'];
   baseSourceReferences: ProcedureContext['baseSourceReferences'];
} {
   return {
      criterion: vctx.applicabilityLookup.criterion,
      applicabilityAssessment: vctx.applicabilityLookup.assessment,
      coverageLookup: vctx.coverageLookup,
      evidenceMode: vctx.ctx.evidenceMode,
      evidence: vctx.ctx.evidence,
      executionSteps: vctx.ctx.executionSteps,
      uncoveredWork: vctx.ctx.uncoveredWork,
      notes: vctx.notes,
      errors: vctx.ctx.errors,
      baseSourceReferences: vctx.ctx.baseSourceReferences,
   };
}

async function processApplicableCriterion(
   vctx: VerificationContextResult,
): Promise<VerifyCriterionResultOutput> {
   const criterion = vctx.applicabilityLookup.criterion;
   await collectProcedureEvidence(vctx.ctx, vctx.coverageLookup.strategy.procedureIds);
   addCoverageGapWork(vctx.ctx, vctx.coverageLookup, vctx.notes);

   const verdict = deriveVerdict({
      evidence: vctx.ctx.evidence,
      uncoveredWork: vctx.ctx.uncoveredWork,
      strategy: vctx.coverageLookup.strategy,
      errors: vctx.ctx.errors,
   });

   return buildOutputFromResult({
      result: buildFinalResult({
         ...buildResultArgs(vctx),
         verdict,
      }),
      criterionId: criterion.id,
      target: vctx.target,
   });
}

export async function verifyCriterionResult(args: {
   criterion: CriterionLookupKey;
   url: string;
   parsedTarget: Platform;
   wcagVersion: string;
}): Promise<VerifyCriterionResultOutput> {
   const vctx = await buildVerificationContext(args);

   if (!isApplicable(vctx.applicabilityLookup.assessment.state)) {
      return buildOutputFromResult({
         result: buildNotApplicableResult({
            ...buildResultArgs(vctx),
         }),
         criterionId: vctx.applicabilityLookup.criterion.id,
         target: vctx.target,
      });
   }

   return processApplicableCriterion(vctx);
}
