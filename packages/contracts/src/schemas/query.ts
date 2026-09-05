import { z } from 'zod';

import { wcagLevelSchema, wcagVersionSchema } from './core.js';
import {
   axeRuleIndexEntrySchema,
   criterionCoverageSchema,
   criterionIdSchema,
   criterionLookupKeySchema,
   criterionSlugSchema,
   evidenceStrategySchema,
   normalizedCriterionSchema,
   applicabilityStateSchema,
   techniqueBodyEntrySchema,
   techniqueIndexEntrySchema,
   understandingDocumentEntrySchema,
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

export const applicabilityElementSchema = z.object({
   xpath: z.string(),
   tag: z.string(),
   snippet: z.string(),
});
export type ApplicabilityElement = z.infer<typeof applicabilityElementSchema>;

export const applicabilitySignalSchema = z.object({
   category: applicabilitySignalCategorySchema,
   source: applicabilitySignalSourceSchema,
   value: z.string(),
   confidence: z.enum(['high', 'medium', 'low']),
   elements: z.array(applicabilityElementSchema).optional(),
});
export type ApplicabilitySignal = z.infer<typeof applicabilitySignalSchema>;

export const documentTargetKindSchema = z.enum(['url', 'file', 'stdin', 'html', 'app']);
export type DocumentTargetKind = z.infer<typeof documentTargetKindSchema>;

export const targetReferenceSchema = z.object({
   kind: documentTargetKindSchema,
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
   title: z.string(),
   state: applicabilityStateSchema,
   reasons: z.array(z.string()),
   matchedSignalCategories: z.array(applicabilitySignalCategorySchema),
   matchedTags: z.array(z.string()),
   elements: z.array(applicabilityElementSchema),
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
   strategy: evidenceStrategySchema,
});
export type CoverageLookupResult = z.infer<typeof coverageLookupResultSchema>;

/** The attribution a copied W3C document carries wherever its text is printed. */
export const w3cDocumentSourceSchema = z.object({
   title: z.string().min(1),
   url: z.string().url(),
   status: z.string().min(1),
});
export type W3cDocumentSource = z.infer<typeof w3cDocumentSourceSchema>;

export const criterionShowResultSchema = coverageLookupResultSchema.extend({
   /** The In Brief or Intent opening of the Understanding document, when one was synced. */
   understandingExcerpt: z.string().optional(),
   /**
    * Names the document the excerpt was copied from. The W3C Document License requires
    * the copyright notice, a link, and the document's status on every copy, and printing
    * the excerpt in a terminal is a copy.
    */
   understandingSource: w3cDocumentSourceSchema.optional(),
});
export type CriterionShowResult = z.infer<typeof criterionShowResultSchema>;

export const wcagLookupResultSchema = z.object({
   lookupKey: criterionLookupKeySchema,
   criterion: normalizedCriterionSchema,
   coverage: criterionCoverageSchema.optional(),
   strategy: evidenceStrategySchema.optional(),
});
export type WcagLookupResult = z.infer<typeof wcagLookupResultSchema>;

export const axeRuleLookupResultSchema = z.object({
   ruleId: z.string(),
   rule: axeRuleIndexEntrySchema,
   description: z.string().optional(),
   help: z.string().optional(),
   helpUrl: z.string().url().optional(),
   criteria: z.array(normalizedCriterionSchema),
});
export type AxeRuleLookupResult = z.infer<typeof axeRuleLookupResultSchema>;

export const techniqueLookupResultSchema = z.object({
   lookupKey: z.string(),
   technique: techniqueIndexEntrySchema,
   criteria: z.array(normalizedCriterionSchema),
   document: techniqueBodyEntrySchema.optional(),
   body: z.string().optional(),
});
export type TechniqueLookupResult = z.infer<typeof techniqueLookupResultSchema>;

export const understandingLookupResultSchema = z.object({
   lookupKey: criterionLookupKeySchema,
   criterion: normalizedCriterionSchema,
   document: understandingDocumentEntrySchema,
   body: z.string(),
});
export type UnderstandingLookupResult = z.infer<typeof understandingLookupResultSchema>;

export const notFoundErrorSchema = z.object({
   type: z.literal('not-found'),
   message: z.string(),
   lookupKey: z.string(),
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
