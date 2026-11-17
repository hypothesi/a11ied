import { z } from 'zod';

import { criterionIdSchema } from './criterion.js';

/** What a procedure is carried out on: one page state, an ordered journey, or the site. */
export const assessmentScopeSchema = z.enum(['site', 'journey', 'state']);
export type AssessmentScope = z.infer<typeof assessmentScopeSchema>;

export const procedureCoverageSchema = z.object({
   definedCriterionIds: z.array(criterionIdSchema),
   gapCriterionIds: z.array(criterionIdSchema),
});
export type ProcedureCoverage = z.infer<typeof procedureCoverageSchema>;

/**
 * How an auditor judges one success criterion: what it applies to, what to do, and what
 * each outcome means. `a1 wcag` prints it and audit work packets quote it.
 */
export const assessmentProcedureSchema = z.object({
   procedureId: z.string().min(1),
   criterionId: criterionIdSchema,
   title: z.string().min(1),
   scope: assessmentScopeSchema,
   applicability: z.string().min(1),
   actions: z.array(z.string().min(1)).min(1),
   evaluation: z.object({
      passed: z.string().min(1),
      failed: z.string().min(1),
      inapplicable: z.string().min(1),
      cantTell: z.string().min(1),
   }),
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
