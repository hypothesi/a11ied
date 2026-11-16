import { z } from 'zod';

import { criterionIdSchema } from './criterion.js';

export const assessmentCapabilitySchema = z.enum([
   'rendered-ui',
   'keyboard',
   'real-reader',
   'screen-reader',
   'dom',
   'native-tree',
   'screenshot',
   'speech',
   'audio',
   'product-context',
   'pointer',
   'viewport',
   'style-overrides',
   'measurement',
   'markup-validation',
   'motion-input',
]);
export type AssessmentCapability = z.infer<typeof assessmentCapabilitySchema>;

export const assessmentScopeSchema = z.enum([
   'site',
   'journey',
   'state',
   'component',
   'element',
]);
export type AssessmentScope = z.infer<typeof assessmentScopeSchema>;

export const assessmentEvidenceKindSchema = z.enum([
   'action-trace',
   'observation',
   'speech',
   'screenshot',
   'measurement',
   'media',
   'product-context',
]);
export type AssessmentEvidenceKind = z.infer<typeof assessmentEvidenceKindSchema>;

export const inapplicabilityKindSchema = z.enum([
   'media-absence',
   'no-media-playback',
   'no-form',
   'no-table',
   'no-live-region',
   'no-animation',
   'no-timed-event',
   'no-multipage-context',
   'no-dragging',
   'no-multipoint-gesture',
   'no-authentication',
]);
export type InapplicabilityKind = z.infer<typeof inapplicabilityKindSchema>;

export const blockerCodeSchema = z.enum([
   'capability-unsupported',
   'external-submission-unauthorized',
   'auth-credentials-missing',
   'third-party-out-of-scope',
   'hardware-sensor-unavailable',
   'human-judgment-required',
]);
export type BlockerCode = z.infer<typeof blockerCodeSchema>;

export const procedureActionTemplateSchema = z.object({
   tool: z.string().min(1),
   args: z.record(z.string(), z.unknown()).optional(),
   expect: z.string().min(1),
   capturesArtifact: z.boolean().optional(),
});
export type ProcedureActionTemplate = z.infer<typeof procedureActionTemplateSchema>;

export const procedureDoneDefinitionSchema = z.object({
   passed: z.string().min(1),
   failed: z.string().min(1),
   inapplicable: z.string().min(1),
   cantTell: z.string().min(1),
   allowedBlockerCodes: z.array(blockerCodeSchema).optional(),
   inapplicabilityKind: inapplicabilityKindSchema.optional(),
});
export type ProcedureDoneDefinition = z.infer<typeof procedureDoneDefinitionSchema>;

export const procedureCoverageSchema = z.object({
   definedCriterionIds: z.array(criterionIdSchema),
   gapCriterionIds: z.array(criterionIdSchema),
});
export type ProcedureCoverage = z.infer<typeof procedureCoverageSchema>;

const TIER_0 = 0,
   TIER_1 = 1,
   TIER_2 = 2,
   TIER_3 = 3;

export const assessmentProcedureSchema = z.object({
   procedureId: z.string().min(1),
   criterionId: criterionIdSchema,
   version: z.string().min(1),
   title: z.string().min(1),
   scope: assessmentScopeSchema,
   applicability: z.string().min(1),
   requiredCapabilities: z.array(assessmentCapabilitySchema),
   inapplicability: z
      .object({
         kind: inapplicabilityKindSchema,
         requiredCapabilities: z.array(assessmentCapabilitySchema).min(1),
         requiredEvidence: z.array(assessmentEvidenceKindSchema).min(1),
      })
      .optional(),
   tier: z
      .union([z.literal(TIER_0), z.literal(TIER_1), z.literal(TIER_2), z.literal(TIER_3)])
      .optional(),
   toolCalls: z.array(procedureActionTemplateSchema).optional(),
   done: procedureDoneDefinitionSchema.optional(),
   setup: z.array(z.string().min(1)).min(1),
   actions: z.array(z.string().min(1)).min(1),
   requiredEvidence: z.array(assessmentEvidenceKindSchema).min(1),
   evaluation: z.object({
      passed: z.string().min(1),
      failed: z.string().min(1),
      inapplicable: z.string().min(1),
      cantTell: z.string().min(1),
   }),
   recovery: z.array(z.string().min(1)).min(1),
   limitations: z.array(z.string().min(1)).min(1),
   sources: z
      .array(
         z.object({
            kind: z.enum(['normative', 'informative']),
            url: z.string().url(),
         }),
      )
      .min(1),
});
export type AssessmentProcedure = z.infer<typeof assessmentProcedureSchema>;

/** Native-reader capabilities also satisfy reader-neutral procedures. */
export function hasAssessmentCapability(
   capabilities: readonly AssessmentCapability[],
   capability: AssessmentCapability,
): boolean {
   return (
      capabilities.includes(capability) ||
      (capability === 'screen-reader' && capabilities.includes('real-reader'))
   );
}
