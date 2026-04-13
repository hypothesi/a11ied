import { z } from 'zod';

import { wcagLevelSchema, wcagVersionSchema } from './core.js';
import {
   criterionCoverageSchema,
   criterionIdSchema,
   criterionLookupKeySchema,
   criterionSlugSchema,
   normalizedCriterionSchema,
   verificationStrategySchema,
   applicabilityStateSchema,
} from './wcag.js';

export const applicabilitySignalCategorySchema = z.enum([
   'auth',
   'dialog',
   'drag-and-drop',
   'form',
   'heading',
   'help',
   'landmark',
   'live-region',
   'media',
   'menu',
   'overlay',
   'repeated-form',
   'tablist',
   'validation',
   'widget',
]);
export type ApplicabilitySignalCategory = z.infer<
   typeof applicabilitySignalCategorySchema
>;

export const applicabilitySignalSourceSchema = z.enum([
   'dom',
   'a11y-tree',
   'metadata',
   'quickref-tag',
   'user-hint',
]);
export type ApplicabilitySignalSource = z.infer<typeof applicabilitySignalSourceSchema>;

export const applicabilitySignalSchema = z.object({
   category: applicabilitySignalCategorySchema,
   source: applicabilitySignalSourceSchema,
   value: z.string(),
   confidence: z.enum(['high', 'medium', 'low']),
});
export type ApplicabilitySignal = z.infer<typeof applicabilitySignalSchema>;

export const targetReferenceSchema = z.object({
   kind: z.literal('url'),
   value: z.string(),
});
export type TargetReference = z.infer<typeof targetReferenceSchema>;

export const applicabilityInputSchema = z.object({
   target: targetReferenceSchema,
   signals: z.array(applicabilitySignalSchema),
   metadata: z.record(z.string(), z.string()),
   userHints: z.array(z.string()),
});
export type ApplicabilityInput = z.infer<typeof applicabilityInputSchema>;

export const criterionApplicabilitySchema = z.object({
   criterionId: criterionIdSchema,
   state: applicabilityStateSchema,
   reasons: z.array(z.string()),
   matchedSignalCategories: z.array(applicabilitySignalCategorySchema),
   matchedTags: z.array(z.string()),
});
export type CriterionApplicability = z.infer<typeof criterionApplicabilitySchema>;

export const applicabilityMatrixSchema = z.object({
   version: wcagVersionSchema,
   target: targetReferenceSchema,
   assessments: z.record(z.string(), criterionApplicabilitySchema),
});
export type ApplicabilityMatrix = z.infer<typeof applicabilityMatrixSchema>;

export const criterionApplicabilityLookupResultSchema = z.object({
   lookupKey: criterionLookupKeySchema,
   version: wcagVersionSchema,
   target: targetReferenceSchema,
   criterion: normalizedCriterionSchema,
   assessment: criterionApplicabilitySchema,
});
export type CriterionApplicabilityLookupResult = z.infer<
   typeof criterionApplicabilityLookupResultSchema
>;

export const searchMatchFieldSchema = z.enum([
   'title',
   'summary',
   'normativeText',
   'details',
   'technique',
   'failure',
   'tag',
   'guideline',
   'principle',
]);
export type SearchMatchField = z.infer<typeof searchMatchFieldSchema>;

export const criterionSearchMatchSchema = z.object({
   field: searchMatchFieldSchema,
   text: z.string(),
   score: z.number().nonnegative(),
});
export type CriterionSearchMatch = z.infer<typeof criterionSearchMatchSchema>;

export const criterionSearchResultSchema = z.object({
   criterionId: criterionIdSchema,
   slug: criterionSlugSchema,
   title: z.string(),
   level: wcagLevelSchema,
   wcagVersion: wcagVersionSchema,
   score: z.number().nonnegative(),
   matches: z.array(criterionSearchMatchSchema),
});
export type CriterionSearchResult = z.infer<typeof criterionSearchResultSchema>;

export const criterionSearchResponseSchema = z.object({
   query: z.string(),
   results: z.array(criterionSearchResultSchema),
});
export type CriterionSearchResponse = z.infer<typeof criterionSearchResponseSchema>;

export const criterionLookupResultSchema = z.object({
   lookupKey: criterionLookupKeySchema,
   criterion: normalizedCriterionSchema,
});
export type CriterionLookupResult = z.infer<typeof criterionLookupResultSchema>;

export const criteriaByLevelResultSchema = z.object({
   version: wcagVersionSchema,
   level: wcagLevelSchema,
   criteria: z.array(normalizedCriterionSchema),
});
export type CriteriaByLevelResult = z.infer<typeof criteriaByLevelResultSchema>;

export const quickrefTagLookupResultSchema = z.object({
   lookupKey: criterionLookupKeySchema,
   criterionId: criterionIdSchema,
   tags: z.array(z.string()),
});
export type QuickrefTagLookupResult = z.infer<typeof quickrefTagLookupResultSchema>;

export const coverageLookupResultSchema = z.object({
   lookupKey: criterionLookupKeySchema,
   criterion: normalizedCriterionSchema,
   coverage: criterionCoverageSchema,
   strategy: verificationStrategySchema,
});
export type CoverageLookupResult = z.infer<typeof coverageLookupResultSchema>;

export const wcagLookupResultSchema = z.object({
   lookupKey: criterionLookupKeySchema,
   criterion: normalizedCriterionSchema,
   coverage: criterionCoverageSchema.optional(),
   strategy: verificationStrategySchema.optional(),
});
export type WcagLookupResult = z.infer<typeof wcagLookupResultSchema>;

export const verificationStrategyLookupResultSchema = z.object({
   lookupKey: criterionLookupKeySchema,
   criterionId: criterionIdSchema,
   strategy: verificationStrategySchema,
});
export type VerificationStrategyLookupResult = z.infer<
   typeof verificationStrategyLookupResultSchema
>;

export const notFoundErrorSchema = z.object({
   type: z.literal('not-found'),
   message: z.string(),
   lookupKey: criterionLookupKeySchema,
});
export type NotFoundError = z.infer<typeof notFoundErrorSchema>;

export const validationErrorSchema = z.object({
   type: z.literal('validation-error'),
   message: z.string(),
   field: z.string(),
   value: z.string(),
   supportedVersions: z.array(wcagVersionSchema).optional(),
   supportedLevels: z.array(wcagLevelSchema).optional(),
});
export type ValidationError = z.infer<typeof validationErrorSchema>;

export const engineQueryErrorSchema = z.union([
   notFoundErrorSchema,
   validationErrorSchema,
]);
export type EngineQueryError = z.infer<typeof engineQueryErrorSchema>;
