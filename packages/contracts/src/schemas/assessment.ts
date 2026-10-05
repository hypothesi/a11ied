import { z } from 'zod';

import { criterionIdSchema } from './criterion.js';

export const assessmentCapabilitySchema = z.enum([
   'rendered-ui',
   'keyboard',
   'real-reader',
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

export const procedureCoverageSchema = z.object({
   definedCriterionIds: z.array(criterionIdSchema),
   gapCriterionIds: z.array(criterionIdSchema),
});
export type ProcedureCoverage = z.infer<typeof procedureCoverageSchema>;

export const assessmentProcedureSchema = z.object({
   procedureId: z.string().min(1),
   criterionId: criterionIdSchema,
   version: z.string().min(1),
   title: z.string().min(1),
   scope: assessmentScopeSchema,
   applicability: z.string().min(1),
   requiredCapabilities: z.array(assessmentCapabilitySchema),
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
