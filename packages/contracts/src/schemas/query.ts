import { z } from 'zod';

import { wcagLevelSchema, wcagVersionSchema } from './core.js';
import {
   actRuleIndexEntrySchema,
   axeRuleIndexEntrySchema,
   criterionTestMethodSchema,
   criterionIdSchema,
   criterionLookupKeySchema,
   criterionSlugSchema,
   evidenceStrategySchema,
   normalizedCriterionSchema,
   relevanceSchema,
   techniqueBodyEntrySchema,
   techniqueIndexEntrySchema,
   understandingDocumentEntrySchema,
   w3cDocumentSourceSchema,
} from './wcag.js';
import { mobileGuidanceEntrySchema } from './mobile.js';

export const pageSignalCategorySchema = z.enum([
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
export type PageSignalCategory = z.infer<typeof pageSignalCategorySchema>;

export const pageSignalSourceSchema = z.enum([
   'dom',
   'a11y-tree',
   'metadata',
   'quickref-tag',
   'user-hint',
]);
export type PageSignalSource = z.infer<typeof pageSignalSourceSchema>;

export const pageElementSchema = z.object({
   xpath: z.string(),
   tag: z.string(),
   snippet: z.string(),
});
export type PageElement = z.infer<typeof pageElementSchema>;

export const pageSignalSchema = z.object({
   category: pageSignalCategorySchema,
   source: pageSignalSourceSchema,
   value: z.string(),
   confidence: z.enum(['high', 'medium', 'low']),
   elements: z.array(pageElementSchema).optional(),
});
export type PageSignal = z.infer<typeof pageSignalSchema>;

export const documentTargetKindSchema = z.enum(['url', 'file', 'stdin', 'html', 'app']);
export type DocumentTargetKind = z.infer<typeof documentTargetKindSchema>;

export const targetReferenceSchema = z.object({
   kind: documentTargetKindSchema,
   value: z.string(),
});
export type TargetReference = z.infer<typeof targetReferenceSchema>;

export const pageScanSchema = z.object({
   target: targetReferenceSchema,
   signals: z.array(pageSignalSchema),
   metadata: z.record(z.string(), z.string()),
   userHints: z.array(z.string()),
});
export type PageScan = z.infer<typeof pageScanSchema>;

export const criterionRelevanceSchema = z.object({
   criterionId: criterionIdSchema,
   title: z.string(),
   state: relevanceSchema,
   reasons: z.array(z.string()),
   matchedSignalCategories: z.array(pageSignalCategorySchema),
   matchedTags: z.array(z.string()),
   elements: z.array(pageElementSchema),
});
export type CriterionRelevance = z.infer<typeof criterionRelevanceSchema>;

export const relevanceMatrixSchema = z.object({
   version: wcagVersionSchema,
   target: targetReferenceSchema,
   assessments: z.record(z.string(), criterionRelevanceSchema),
});
export type RelevanceMatrix = z.infer<typeof relevanceMatrixSchema>;

export const criterionRelevanceLookupResultSchema = z.object({
   lookupKey: criterionLookupKeySchema,
   version: wcagVersionSchema,
   target: targetReferenceSchema,
   criterion: normalizedCriterionSchema,
   assessment: criterionRelevanceSchema,
});
export type CriterionRelevanceLookupResult = z.infer<
   typeof criterionRelevanceLookupResultSchema
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

export const testMethodLookupResultSchema = z.object({
   lookupKey: criterionLookupKeySchema,
   criterion: normalizedCriterionSchema,
   testMethod: criterionTestMethodSchema,
   strategy: evidenceStrategySchema,
   /** The named form of `coverage.actRuleIds`, in the same order. */
   actRules: z.array(actRuleIndexEntrySchema),
});
export type TestMethodLookupResult = z.infer<typeof testMethodLookupResultSchema>;

export const criterionShowResultSchema = testMethodLookupResultSchema.extend({
   /** The In Brief or Intent opening of the Understanding document, when one was synced. */
   understandingExcerpt: z.string().optional(),
   /**
    * Names the document the excerpt was copied from. The W3C Document License requires
    * the copyright notice, a link, and the document's status on every copy, and printing
    * the excerpt in a terminal is a copy.
    */
   understandingSource: w3cDocumentSourceSchema.optional(),
   /**
    * What WCAG2Mobile says about this criterion, when it has published guidance for it.
    * The entry carries its own title, url, and status for the same attribution reason.
    */
   mobileGuidance: mobileGuidanceEntrySchema.optional(),
});
export type CriterionShowResult = z.infer<typeof criterionShowResultSchema>;

export const wcagLookupResultSchema = z.object({
   lookupKey: criterionLookupKeySchema,
   criterion: normalizedCriterionSchema,
   testMethod: criterionTestMethodSchema.optional(),
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
   /** The named form of `rule.actIds`, in the same order. */
   actRules: z.array(actRuleIndexEntrySchema),
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
