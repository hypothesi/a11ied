import {
   verificationEvidenceRecordSchema,
   verificationUncoveredWorkItemSchema,
   type CliMessage,
   type VerificationEvidenceMode,
   type VerificationEvidenceRecord,
   type VerificationExecutionStep,
   type VerificationSourceReference,
   type VerificationUncoveredWorkItem,
} from '@a11ied/contracts';
import { appendProcedureError } from './error-reporting.js';
import {
   buildPatternSourceReferences,
   formatAxeSummary,
   formatPatternSummary,
} from './procedure-utils.js';

function getErrorCause(error: unknown): string {
   if (error instanceof Error) {
      return error.message;
   }
   return String(error);
}

function buildUncoveredWorkPayload(args: {
   kind: VerificationUncoveredWorkItem['kind'];
   message: string;
   procedureId?: string;
   sourceReferences: VerificationSourceReference[];
}): Record<string, unknown> {
   const payload: Record<string, unknown> = {
      kind: args.kind,
      message: args.message,
      sourceReferences: args.sourceReferences,
   };
   if (args.procedureId) {
      payload.procedureId = args.procedureId;
   }
   return payload;
}

export function createUncoveredWork(args: {
   kind: VerificationUncoveredWorkItem['kind'];
   message: string;
   procedureId?: string;
   sourceReferences: VerificationSourceReference[];
}): VerificationUncoveredWorkItem {
   return verificationUncoveredWorkItemSchema.parse(buildUncoveredWorkPayload(args));
}

function createManualEvidence(args: {
   criterionId: string;
   summary: string;
   sourceReferences: VerificationSourceReference[];
   procedureId: string;
   notes: string[];
}): VerificationEvidenceRecord {
   return verificationEvidenceRecordSchema.parse({
      id: `manual:${args.criterionId}:${args.procedureId}`,
      kind: 'manual-note',
      mode: 'manual',
      procedureId: args.procedureId,
      collectedAt: new Date().toISOString(),
      summary: args.summary,
      sourceReferences: args.sourceReferences,
      notes: args.notes,
   });
}

export function handleAxeScanStep(args: {
   procedureId: string;
   criterionId: string;
   baseSourceReferences: VerificationSourceReference[];
   axeRuleIds: string[];
   axeResult: { violations: unknown[] };
   evidenceMode: VerificationEvidenceMode;
   executionSteps: VerificationExecutionStep[];
   evidence: VerificationEvidenceRecord[];
}): void {
   const ruleReferences = args.axeRuleIds.map((ruleId) => ({
      kind: 'axe-rule' as const,
      id: ruleId,
      label: ruleId,
   }));

   args.executionSteps.push({
      procedureId: args.procedureId,
      kind: 'axe',
      mode: 'automated',
      status: 'completed',
      sourceReferences: [...args.baseSourceReferences, ...ruleReferences],
   });

   args.evidence.push(
      verificationEvidenceRecordSchema.parse({
         id: `axe:${args.criterionId}`,
         kind: 'axe',
         mode: 'automated',
         procedureId: args.procedureId,
         collectedAt: new Date().toISOString(),
         summary: formatAxeSummary(args.axeResult.violations.length, args.criterionId),
         sourceReferences: [...args.baseSourceReferences, ...ruleReferences],
         axeResult: args.axeResult,
         notes: [],
      }),
   );
}

export function handleAxeScanError(args: {
   procedureId: string;
   criterionId: string;
   baseSourceReferences: VerificationSourceReference[];
   error: unknown;
   executionSteps: VerificationExecutionStep[];
   errors: CliMessage[];
}): void {
   const cause = getErrorCause(args.error);
   args.executionSteps.push({
      procedureId: args.procedureId,
      kind: 'axe',
      mode: 'automated',
      status: 'error',
      reason: cause,
      sourceReferences: args.baseSourceReferences,
   });
   appendProcedureError({
      criterionId: args.criterionId,
      procedureId: args.procedureId,
      cause,
      errors: args.errors,
   });
}

export function handleManualReviewStep(args: {
   procedureId: string;
   criterionId: string;
   baseSourceReferences: VerificationSourceReference[];
   strategyNotes: string[];
   executionSteps: VerificationExecutionStep[];
   evidence: VerificationEvidenceRecord[];
   uncoveredWork: VerificationUncoveredWorkItem[];
}): void {
   args.executionSteps.push({
      procedureId: args.procedureId,
      kind: 'manual',
      mode: 'manual',
      status: 'skipped',
      reason: 'Manual review remains required for this criterion.',
      sourceReferences: args.baseSourceReferences,
   });
   args.uncoveredWork.push(
      createUncoveredWork({
         kind: 'manual-only',
         message:
            'A human review is still required before this criterion can be signed off.',
         procedureId: args.procedureId,
         sourceReferences: args.baseSourceReferences,
      }),
   );
   args.evidence.push(
      createManualEvidence({
         criterionId: args.criterionId,
         summary: 'Manual review is still required for this criterion.',
         sourceReferences: args.baseSourceReferences,
         procedureId: args.procedureId,
         notes: args.strategyNotes,
      }),
   );
}

export function handlePatternStep(args: {
   procedureId: string;
   criterionId: string;
   baseSourceReferences: VerificationSourceReference[];
   evidenceMode: VerificationEvidenceMode;
   patternResult: { assertions: Array<{ status: string }> };
   executionSteps: VerificationExecutionStep[];
   evidence: VerificationEvidenceRecord[];
}): void {
   const patternRefs = buildPatternSourceReferences(
      args.baseSourceReferences,
      args.procedureId,
   );

   args.executionSteps.push({
      procedureId: args.procedureId,
      kind: 'pattern',
      mode: args.evidenceMode,
      status: 'completed',
      sourceReferences: patternRefs,
   });

   args.evidence.push(
      verificationEvidenceRecordSchema.parse({
         id: `pattern:${args.criterionId}:${args.procedureId}`,
         kind: 'pattern',
         mode: args.evidenceMode,
         procedureId: args.procedureId,
         collectedAt: new Date().toISOString(),
         summary: formatPatternSummary(args.patternResult.assertions, args.procedureId),
         sourceReferences: patternRefs,
         patternResult: args.patternResult,
         notes: [],
      }),
   );
}

export function handlePatternError(args: {
   procedureId: string;
   criterionId: string;
   baseSourceReferences: VerificationSourceReference[];
   evidenceMode: VerificationEvidenceMode;
   error: unknown;
   executionSteps: VerificationExecutionStep[];
   errors: CliMessage[];
}): void {
   const patternRefs = buildPatternSourceReferences(
      args.baseSourceReferences,
      args.procedureId,
   );
   const cause = getErrorCause(args.error);
   args.executionSteps.push({
      procedureId: args.procedureId,
      kind: 'pattern',
      mode: args.evidenceMode,
      status: 'error',
      reason: cause,
      sourceReferences: patternRefs,
   });
   appendProcedureError({
      criterionId: args.criterionId,
      procedureId: args.procedureId,
      cause,
      errors: args.errors,
   });
}

export function handleUnrecognizedProcedure(args: {
   procedureId: string;
   baseSourceReferences: VerificationSourceReference[];
   executionSteps: VerificationExecutionStep[];
   uncoveredWork: VerificationUncoveredWorkItem[];
}): void {
   args.executionSteps.push({
      procedureId: args.procedureId,
      kind: 'manual',
      mode: 'unknown',
      status: 'skipped',
      reason: `Procedure "${args.procedureId}" is not implemented yet.`,
      sourceReferences: args.baseSourceReferences,
   });
   args.uncoveredWork.push(
      createUncoveredWork({
         kind: 'missing-pattern',
         message: `Procedure "${args.procedureId}" is not implemented yet.`,
         procedureId: args.procedureId,
         sourceReferences: args.baseSourceReferences,
      }),
   );
}
