import { z } from 'zod';

import { blockerCodeSchema } from './assessment.js';
import { criterionIdSchema } from './criterion.js';

const TIER_THREE = 3,
   TIER_TWO = 2;

export const evaluationTierSchema = z.union([
   z.literal(0),
   z.literal(1),
   z.literal(TIER_TWO),
   z.literal(TIER_THREE),
]);
export type EvaluationTier = z.infer<typeof evaluationTierSchema>;

export const verdictOutcomeSchema = z.enum([
   'passed',
   'failed',
   'inapplicable',
   'needsReview',
   'cantTell',
   'excluded',
]);
export type VerdictOutcome = z.infer<typeof verdictOutcomeSchema>;

export const verdictImpactSchema = z.enum(['critical', 'serious', 'moderate', 'minor']);
export type VerdictImpact = z.infer<typeof verdictImpactSchema>;

export const verdictMethodSchema = z.enum([
   'axe',
   'dom-facts',
   'programmatic-probe',
   'virtual-sr',
   'native-sr',
   'agent-judgment',
   'scope-exclusion',
]);
export type VerdictMethod = z.infer<typeof verdictMethodSchema>;

/**
 * Pointer into the observation cache: one fingerprinted bundle plus an optional lookup
 * path.
 */
export const observationRefSchema = z.object({
   fingerprint: z.string().regex(/^[a-zA-Z0-9_-]+$/u),
   digest: z.string().optional(),
   path: z.string().min(1),
   pointer: z.string().min(1).optional(),
   note: z.string().min(1).optional(),
});
export type ObservationRef = z.infer<typeof observationRefSchema>;

export const measurementUnitSchema = z.enum([
   'contrastRatio',
   'px',
   'ms',
   'Hz',
   'count',
   'ratio',
   'percent',
]);
export type MeasurementUnit = z.infer<typeof measurementUnitSchema>;

export const measurementRecordSchema = z.object({
   metric: z.string().min(1),
   value: z.number(),
   threshold: z.number().optional(),
   unit: measurementUnitSchema,
   target: z.string().min(1).optional(),
   pass: z.boolean().optional(),
});
export type MeasurementRecord = z.infer<typeof measurementRecordSchema>;

export const verdictNextActionSchema = z.object({
   kind: z.enum([
      'inspect-element',
      'run-procedure',
      'escalate-native-sr',
      'provide-authorization',
      'review-visual',
   ]),
   summary: z.string().min(1),
   procedureId: z.string().min(1).optional(),
   selector: z.string().min(1).optional(),
   missingCapability: z.string().min(1).optional(),
});
export type VerdictNextAction = z.infer<typeof verdictNextActionSchema>;

export const templateGroupMemberRoleSchema = z.enum(['representative', 'member']);
export type TemplateGroupMemberRole = z.infer<typeof templateGroupMemberRoleSchema>;

export const templateGroupMetadataSchema = z.object({
   templateGroupId: z.string().min(1),
   representativeStateId: z.string().min(1),
   memberRole: templateGroupMemberRoleSchema,
});
export type TemplateGroupMetadata = z.infer<typeof templateGroupMetadataSchema>;

/** First-class out-of-scope rule so excluded checks surface as disclosed, not unresolved. */
export const scopeExclusionRuleSchema = z.object({
   ruleId: z.string().min(1),
   reason: z.string().min(1),
   selectors: z.array(z.string().min(1)).optional(),
   urlPatterns: z.array(z.string().min(1)).optional(),
   stateIds: z.array(z.string().min(1)).optional(),
   criterionIds: z.array(criterionIdSchema).optional(),
});
export type ScopeExclusionRule = z.infer<typeof scopeExclusionRuleSchema>;

export const pageVerdictStatusSchema = z.enum([
   'failing',
   'passing-so-far',
   'passed',
   'blocked',
   'excluded',
   'unstarted',
]);
export type PageVerdictStatus = z.infer<typeof pageVerdictStatusSchema>;

export const pageVerdictSchema = z.object({
   stateId: z.string().min(1),
   targetUrl: z.string().min(1),
   status: pageVerdictStatusSchema,
   failingCount: z.number().int().nonnegative(),
   passedCount: z.number().int().nonnegative(),
   needsReviewCount: z.number().int().nonnegative(),
   excludedCount: z.number().int().nonnegative(),
   highestImpact: verdictImpactSchema.optional(),
});
export type PageVerdict = z.infer<typeof pageVerdictSchema>;

export const procedureAssessmentSchema = z.object({
   version: z.string().min(1),
   actions: z.array(
      z.object({
         index: z.number().int().nonnegative(),
         outcome: z.enum(['passed', 'failed', 'inapplicable', 'cantTell']),
         observation: z.string().trim().min(1),
         evidence: z.array(observationRefSchema).min(1),
      }),
   ),
});
export type ProcedureAssessment = z.infer<typeof procedureAssessmentSchema>;

/**
 * One verdict per `(criterionId, stateId, procedureId)`. Re-scoring the same check
 * appends a replacement; readers collapse to the latest record per check key.
 */
const verdictRecordSchema = z.object({
   id: z.string().min(1),
   criterionId: criterionIdSchema,
   stateId: z.string().min(1),
   procedureId: z.string().min(1).optional(),
   blockerCode: blockerCodeSchema.optional(),
   assessment: procedureAssessmentSchema.optional(),
   tier: evaluationTierSchema,
   outcome: verdictOutcomeSchema,
   confidence: z.number().min(0).max(1),
   impact: verdictImpactSchema.optional(),
   method: verdictMethodSchema,
   rationale: z.string().min(1),
   evidence: z.array(observationRefSchema),
   measurements: z.array(measurementRecordSchema).optional(),
   repro: z.array(z.string().min(1)),
   nextAction: verdictNextActionSchema.optional(),
   exclusionReason: z.string().min(1).optional(),
   recordedAt: z.string().min(1),
   actor: z.string().optional(),
   supersedes: z.object({ recordedAt: z.string(), digest: z.string() }).optional(),
});

export const verdictSchema = verdictRecordSchema.superRefine((val, ctx) => {
   if (val.confidence === 1 && val.tier > 0) {
      ctx.addIssue({
         code: 'custom',
         path: ['confidence'],
         message: 'confidence 1.0 is restricted to Tier 0 deterministic rules',
      });
   }
   if ((val.outcome === 'needsReview' || val.outcome === 'cantTell') && !val.nextAction) {
      ctx.addIssue({
         code: 'custom',
         path: ['nextAction'],
         message: 'needsReview and cantTell verdicts require a structured nextAction',
      });
   }
   if (val.outcome === 'excluded' && !val.exclusionReason) {
      ctx.addIssue({
         code: 'custom',
         path: ['exclusionReason'],
         message: 'excluded verdicts require an exclusionReason',
      });
   }
});
export type Verdict = z.infer<typeof verdictSchema>;

export const verdictProposalSchema = verdictRecordSchema
   .omit({ id: true, recordedAt: true, actor: true, supersedes: true })
   .partial({
      tier: true,
      confidence: true,
      method: true,
      evidence: true,
      repro: true,
   })
   .extend({ blockerCode: blockerCodeSchema.optional() });
export type VerdictProposal = z.infer<typeof verdictProposalSchema>;
