import { z } from 'zod';

import {
   cliMessageSchema,
   driverActionResultSchema,
   interactionPatternResultSchema,
   platformSchema,
   wcagLevelSchema,
   wcagVersionSchema,
} from './core-schemas.js';
import {
   axeRunResultSchema,
   criterionCoverageSchema,
   criterionIdSchema,
   criterionLookupKeySchema,
   normalizedCriterionSchema,
   preferredEvidenceModeSchema,
   verificationStrategySchema,
} from './wcag-schemas.js';
import { criterionApplicabilitySchema, targetReferenceSchema } from './query-schemas.js';

export const verificationVerdictSchema = z.enum([
   'pass',
   'fail',
   'needs-manual-review',
   'not-applicable',
   'not-covered',
   'error',
]);
export type VerificationVerdict = z.infer<typeof verificationVerdictSchema>;

export const verificationEvidenceModeSchema = preferredEvidenceModeSchema;
export type VerificationEvidenceMode = z.infer<typeof verificationEvidenceModeSchema>;

export const verificationRequestedScopeSchema = z.discriminatedUnion('kind', [
   z.object({
      kind: z.literal('criterion'),
      criterion: criterionLookupKeySchema,
   }),
   z.object({
      kind: z.literal('level'),
      level: wcagLevelSchema,
   }),
]);
export type VerificationRequestedScope = z.infer<typeof verificationRequestedScopeSchema>;

export const verificationSourceKindSchema = z.enum([
   'criterion',
   'coverage-artifact',
   'strategy-artifact',
   'axe-rule',
   'act-rule',
   'pattern',
   'driver-session',
   'applicability',
   'target',
   'manual-note',
   'spec',
]);
export type VerificationSourceKind = z.infer<typeof verificationSourceKindSchema>;

export const verificationSourceReferenceSchema = z.object({
   kind: verificationSourceKindSchema,
   id: z.string(),
   label: z.string(),
   locator: z.string().optional(),
});
export type VerificationSourceReference = z.infer<
   typeof verificationSourceReferenceSchema
>;

export const verificationEvidenceKindSchema = z.enum([
   'axe',
   'pattern',
   'driver',
   'applicability',
   'manual-note',
]);
export type VerificationEvidenceKind = z.infer<typeof verificationEvidenceKindSchema>;

export const verificationEvidenceRecordSchema = z.object({
   id: z.string(),
   kind: verificationEvidenceKindSchema,
   mode: verificationEvidenceModeSchema,
   procedureId: z.string().optional(),
   collectedAt: z.string().datetime(),
   summary: z.string(),
   sourceReferences: z.array(verificationSourceReferenceSchema),
   axeResult: axeRunResultSchema.optional(),
   patternResult: interactionPatternResultSchema.optional(),
   driverResult: driverActionResultSchema.optional(),
   applicability: criterionApplicabilitySchema.optional(),
   notes: z.array(z.string()),
});
export type VerificationEvidenceRecord = z.infer<typeof verificationEvidenceRecordSchema>;

export const verificationUncoveredWorkKindSchema = z.enum([
   'manual-only',
   'not-covered',
   'requires-real-target',
   'missing-pattern',
   'missing-rule',
   'unsupported-target',
]);
export type VerificationUncoveredWorkKind = z.infer<
   typeof verificationUncoveredWorkKindSchema
>;

export const verificationUncoveredWorkItemSchema = z.object({
   kind: verificationUncoveredWorkKindSchema,
   message: z.string(),
   procedureId: z.string().optional(),
   sourceReferences: z.array(verificationSourceReferenceSchema),
});
export type VerificationUncoveredWorkItem = z.infer<
   typeof verificationUncoveredWorkItemSchema
>;

export const verificationProcedureKindSchema = z.enum([
   'applicability',
   'axe',
   'pattern',
   'driver',
   'manual',
]);
export type VerificationProcedureKind = z.infer<typeof verificationProcedureKindSchema>;

export const verificationExecutionStepSchema = z.object({
   procedureId: z.string(),
   kind: verificationProcedureKindSchema,
   mode: verificationEvidenceModeSchema,
   status: z.enum(['planned', 'completed', 'skipped', 'error']),
   reason: z.string().optional(),
   sourceReferences: z.array(verificationSourceReferenceSchema),
});
export type VerificationExecutionStep = z.infer<typeof verificationExecutionStepSchema>;

export const verificationExecutionPlanSchema = z.object({
   strategyId: z.string(),
   preferredEvidenceMode: verificationEvidenceModeSchema,
   selectedProcedureIds: z.array(z.string()),
   steps: z.array(verificationExecutionStepSchema),
});
export type VerificationExecutionPlan = z.infer<typeof verificationExecutionPlanSchema>;

export const verificationCriterionResultSchema = z.object({
   criterionId: criterionIdSchema,
   criterion: normalizedCriterionSchema,
   applicability: criterionApplicabilitySchema,
   coverage: criterionCoverageSchema,
   strategy: verificationStrategySchema,
   executionPlan: verificationExecutionPlanSchema,
   verdict: verificationVerdictSchema,
   evidenceMode: verificationEvidenceModeSchema,
   procedureIds: z.array(z.string()),
   evidence: z.array(verificationEvidenceRecordSchema),
   sourceReferences: z.array(verificationSourceReferenceSchema),
   uncoveredWork: z.array(verificationUncoveredWorkItemSchema),
   notes: z.array(z.string()),
   errors: z.array(cliMessageSchema),
});
export type VerificationCriterionResult = z.infer<
   typeof verificationCriterionResultSchema
>;

const verificationVerdictCountSchema = z.object({
   pass: z.number().int().nonnegative(),
   fail: z.number().int().nonnegative(),
   'needs-manual-review': z.number().int().nonnegative(),
   'not-applicable': z.number().int().nonnegative(),
   'not-covered': z.number().int().nonnegative(),
   error: z.number().int().nonnegative(),
});

const verificationEvidenceModeCountSchema = z.object({
   automated: z.number().int().nonnegative(),
   hybrid: z.number().int().nonnegative(),
   manual: z.number().int().nonnegative(),
   unknown: z.number().int().nonnegative(),
});

export const verificationReportSummarySchema = z.object({
   totalCriteria: z.number().int().nonnegative(),
   verdicts: verificationVerdictCountSchema,
   evidenceModes: verificationEvidenceModeCountSchema,
   uncoveredCount: z.number().int().nonnegative(),
   manualOnlyCount: z.number().int().nonnegative(),
   failedCount: z.number().int().nonnegative(),
});
export type VerificationReportSummary = z.infer<typeof verificationReportSummarySchema>;

export const levelVerificationResultSchema = z.object({
   level: wcagLevelSchema,
   wcagVersion: wcagVersionSchema,
   summary: verificationReportSummarySchema,
   criteria: z.array(verificationCriterionResultSchema),
   uncoveredCriterionIds: z.array(criterionIdSchema),
   manualOnlyCriterionIds: z.array(criterionIdSchema),
});
export type LevelVerificationResult = z.infer<typeof levelVerificationResultSchema>;

export const verificationTargetSchema = targetReferenceSchema.extend({
   platform: platformSchema.optional(),
   resolvedUrl: z.string().url().optional(),
   storybookBaseUrl: z.string().url().optional(),
});
export type VerificationTarget = z.infer<typeof verificationTargetSchema>;

export const verificationReportSchema = z.object({
   target: verificationTargetSchema,
   wcagVersion: wcagVersionSchema,
   requestedScope: verificationRequestedScopeSchema,
   summary: verificationReportSummarySchema,
   criteria: z.array(verificationCriterionResultSchema),
   warnings: z.array(cliMessageSchema),
   errors: z.array(cliMessageSchema),
});
export type VerificationReport = z.infer<typeof verificationReportSchema>;
