import { z } from 'zod';

import { wcagLevelSchema, wcagVersionSchema } from './core.js';
import { fourWayAutomationCountSchema, techniqueReferenceSchema } from './helpers.js';

export const criterionIdSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export type CriterionId = z.infer<typeof criterionIdSchema>;

export const criterionSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type CriterionSlug = z.infer<typeof criterionSlugSchema>;

export const criterionLookupKeySchema = z.union([criterionIdSchema, criterionSlugSchema]);
export type CriterionLookupKey = z.infer<typeof criterionLookupKeySchema>;

export const axeImpactSchema = z
   .enum(['minor', 'moderate', 'serious', 'critical'])
   .nullish();
export type AxeImpact = z.infer<typeof axeImpactSchema>;

export const axeNodeResultSchema = z.object({
   target: z.array(z.string()),
   html: z.string(),
   failureSummary: z.string().nullish(),
});
export type AxeNodeResult = z.infer<typeof axeNodeResultSchema>;

export const axeRuleResultSchema = z.object({
   id: z.string(),
   impact: axeImpactSchema,
   description: z.string(),
   help: z.string(),
   helpUrl: z.string().url(),
   tags: z.array(z.string()),
   nodes: z.array(axeNodeResultSchema),
});
export type AxeRuleResult = z.infer<typeof axeRuleResultSchema>;

export const axeSelectionSchema = z.discriminatedUnion('kind', [
   z.object({
      kind: z.literal('all'),
      resolvedRuleIds: z.array(z.string()),
   }),
   z.object({
      kind: z.literal('criterion'),
      criterion: criterionLookupKeySchema,
      resolvedRuleIds: z.array(z.string()),
   }),
   z.object({
      kind: z.literal('level'),
      level: wcagLevelSchema,
      resolvedRuleIds: z.array(z.string()),
   }),
   z.object({
      kind: z.literal('rule'),
      ruleIds: z.array(z.string()),
   }),
]);
export type AxeSelection = z.infer<typeof axeSelectionSchema>;

export const axeRunResultSchema = z.object({
   url: z.string().min(1),
   wcagVersion: wcagVersionSchema,
   selection: axeSelectionSchema,
   ruleIds: z.array(z.string()),
   violations: z.array(axeRuleResultSchema),
   passes: z.array(axeRuleResultSchema),
   incomplete: z.array(axeRuleResultSchema),
   inapplicable: z.array(axeRuleResultSchema),
   warnings: z.array(z.string()).optional(),
});
export type AxeRunResult = z.infer<typeof axeRunResultSchema>;

export const axeFailOnImpactSchema = z.enum(['minor', 'moderate', 'serious', 'critical']);
export type AxeFailOnImpact = z.infer<typeof axeFailOnImpactSchema>;

/** A baseline file's accepted findings, one key per rule id plus violating node target. */
export const axeBaselineSchema = z.object({
   acceptedFindings: z.array(z.string()),
});
export type AxeBaseline = z.infer<typeof axeBaselineSchema>;

export const axeVerdictFindingSchema = z.object({
   ruleId: z.string(),
   impact: axeImpactSchema,
   target: z.array(z.string()),
});
export type AxeVerdictFinding = z.infer<typeof axeVerdictFindingSchema>;

export const axeVerdictSchema = z.object({
   failOn: axeFailOnImpactSchema,
   passed: z.boolean(),
   totalViolationNodes: z.number().int().nonnegative(),
   baselinedCount: z.number().int().nonnegative(),
   failingFindings: z.array(axeVerdictFindingSchema),
});
export type AxeVerdict = z.infer<typeof axeVerdictSchema>;

export const testMethodSchema = z.enum(['automated', 'hybrid', 'manual', 'unknown']);
export type TestMethod = z.infer<typeof testMethodSchema>;

export const preferredEvidenceModeSchema = z.enum([
   'automated',
   'hybrid',
   'manual',
   'unknown',
]);
export type PreferredEvidenceMode = z.infer<typeof preferredEvidenceModeSchema>;

export const relevanceSchema = z.enum([
   'relevant',
   'not-detected',
   'out-of-scope',
   'unknown',
]);
export type Relevance = z.infer<typeof relevanceSchema>;

export const normalizedTechniqueSchema = techniqueReferenceSchema.extend({
   groupTitle: z.string().optional(),
   groupNote: z.string().optional(),
   suffix: z.string().optional(),
   relatedKeys: z.array(z.string()),
   isSynthetic: z.boolean(),
});
export type NormalizedTechnique = z.infer<typeof normalizedTechniqueSchema>;

export const normalizedCriterionSchema = z.object({
   id: z.string(),
   slug: z.string(),
   title: z.string(),
   summary: z.string(),
   level: wcagLevelSchema,
   wcagVersion: wcagVersionSchema,
   normativeText: z.string(),
   understandingUrl: z.string().url(),
   versions: z.array(z.string()),
   altIds: z.array(z.string()),
   details: z.array(z.string()),
   tags: z.array(z.string()),
   principle: z.object({
      id: z.string(),
      number: z.string(),
      title: z.string(),
   }),
   guideline: z.object({
      id: z.string(),
      number: z.string(),
      title: z.string(),
   }),
   techniques: z.array(normalizedTechniqueSchema),
   advisoryTechniques: z.array(normalizedTechniqueSchema),
   failures: z.array(normalizedTechniqueSchema),
});
export type NormalizedCriterion = z.infer<typeof normalizedCriterionSchema>;

export const normalizedCriteriaArtifactSchema = z.object({
   version: wcagVersionSchema,
   criteria: z.record(z.string(), normalizedCriterionSchema),
});
export type NormalizedCriteriaArtifact = z.infer<typeof normalizedCriteriaArtifactSchema>;

const LEVEL_A = 'A' as const;

export const criteriaByLevelArtifactSchema = z.object({
   version: wcagVersionSchema,
   levels: z.object({
      [LEVEL_A]: z.array(z.string()),
      AA: z.array(z.string()),
      AAA: z.array(z.string()),
   }),
});
export type CriteriaByLevelArtifact = z.infer<typeof criteriaByLevelArtifactSchema>;

export const slugIndexArtifactSchema = z.object({
   version: wcagVersionSchema,
   slugs: z.record(z.string(), z.string()),
});
export type SlugIndexArtifact = z.infer<typeof slugIndexArtifactSchema>;

export const techniqueIndexEntrySchema = techniqueReferenceSchema.extend({
   criterionIds: z.array(z.string()),
});
export type TechniqueIndexEntry = z.infer<typeof techniqueIndexEntrySchema>;

export const techniqueIndexArtifactSchema = z.object({
   version: wcagVersionSchema,
   techniques: z.record(z.string(), techniqueIndexEntrySchema),
});
export type TechniqueIndexArtifact = z.infer<typeof techniqueIndexArtifactSchema>;

export const failureIndexArtifactSchema = z.object({
   version: wcagVersionSchema,
   failures: z.record(z.string(), techniqueIndexEntrySchema),
});
export type FailureIndexArtifact = z.infer<typeof failureIndexArtifactSchema>;

export const axeRuleIndexEntrySchema = z.object({
   ruleId: z.string(),
   tags: z.array(z.string()),
   actIds: z.array(z.string()),
   criterionIds: z.array(z.string()),
});
export type AxeRuleIndexEntry = z.infer<typeof axeRuleIndexEntrySchema>;

export const axeRuleIndexArtifactSchema = z.object({
   version: wcagVersionSchema,
   rules: z.record(z.string(), axeRuleIndexEntrySchema),
});
export type AxeRuleIndexArtifact = z.infer<typeof axeRuleIndexArtifactSchema>;

/**
 * Where an ACT rule stands in the W3C process. Only a `published` rule states a check the
 * WCAG mapping treats as current; `proposed` and `deprecated` rules are indexed anyway so
 * an id printed from anywhere, including an axe rule's `actIds`, still resolves to a
 * name.
 */
export const actRuleStatusSchema = z.enum(['published', 'proposed', 'deprecated']);
export type ActRuleStatus = z.infer<typeof actRuleStatusSchema>;

export const actRuleIndexEntrySchema = z.object({
   ruleId: z.string(),
   title: z.string().min(1),
   url: z.string().url(),
   status: actRuleStatusSchema,
   criterionIds: z.array(z.string()),
});
export type ActRuleIndexEntry = z.infer<typeof actRuleIndexEntrySchema>;

export const actRuleIndexArtifactSchema = z.object({
   version: wcagVersionSchema,
   rules: z.record(z.string(), actRuleIndexEntrySchema),
});
export type ActRuleIndexArtifact = z.infer<typeof actRuleIndexArtifactSchema>;

export const criterionTestMethodSchema = z.object({
   criterionId: z.string(),
   method: testMethodSchema,
   axeRuleIds: z.array(z.string()),
   actRuleIds: z.array(z.string()),
   sourceAttribution: z.array(z.string()),
   notes: z.array(z.string()),
   updatedAt: z.string().datetime(),
});
export type CriterionTestMethod = z.infer<typeof criterionTestMethodSchema>;

export const testMethodArtifactSchema = z.object({
   version: wcagVersionSchema,
   testMethods: z.record(z.string(), criterionTestMethodSchema),
});
export type TestMethodArtifact = z.infer<typeof testMethodArtifactSchema>;

export const evidenceStrategySchema = z.object({
   criterionId: z.string(),
   preferredEvidenceMode: preferredEvidenceModeSchema,
   procedureIds: z.array(z.string()),
   requiresRealTarget: z.boolean(),
   notes: z.array(z.string()),
});
export type EvidenceStrategy = z.infer<typeof evidenceStrategySchema>;

export const strategyArtifactSchema = z.object({
   version: wcagVersionSchema,
   strategies: z.record(z.string(), evidenceStrategySchema),
});
export type StrategyArtifact = z.infer<typeof strategyArtifactSchema>;

const testMethodSummaryBucketSchema = fourWayAutomationCountSchema.extend({
   criteria: z.number().int().nonnegative(),
});

export const testMethodSummaryArtifactSchema = z.object({
   version: wcagVersionSchema,
   updatedAt: z.string().datetime(),
   totals: testMethodSummaryBucketSchema,
   byLevel: z.object({
      [LEVEL_A]: testMethodSummaryBucketSchema,
      AA: testMethodSummaryBucketSchema,
      AAA: testMethodSummaryBucketSchema,
   }),
   ruleSources: z.object({
      criteriaWithAxe: z.number().int().nonnegative(),
      criteriaWithAct: z.number().int().nonnegative(),
      criteriaWithBoth: z.number().int().nonnegative(),
   }),
   representativeCriterionIds: z.object({
      automated: z.array(z.string()),
      hybrid: z.array(z.string()),
      manual: z.array(z.string()),
      unknown: z.array(z.string()),
   }),
});
export type TestMethodSummaryArtifact = z.infer<typeof testMethodSummaryArtifactSchema>;

/** The attribution a copied W3C document carries wherever its text is printed. */
export const w3cDocumentSourceSchema = z.object({
   title: z.string().min(1),
   url: z.string().url(),
   status: z.string().min(1),
});
export type W3cDocumentSource = z.infer<typeof w3cDocumentSourceSchema>;

/**
 * Attribution plus enough provenance to tell when a copied document was last synced and
 * whether the upstream page has changed since.
 */
export const w3cDocumentProvenanceSchema = w3cDocumentSourceSchema.extend({
   sourceSha256: z.string().min(1),
   syncedAt: z.string().datetime(),
   etag: z.string().optional(),
});

/**
 * Attribution and freshness fields every copied W3C document carries, per the W3C
 * Document License: a link to the original, its status, and enough provenance to tell
 * when it was last synced. `bodyHash` points into the shared, deduplicated content store
 * so identical documents are stored once even when several ids reference them.
 */
export const w3cDocumentMetaSchema = w3cDocumentProvenanceSchema.extend({
   bodyHash: z.string().min(1),
});
export type W3cDocumentMeta = z.infer<typeof w3cDocumentMetaSchema>;

export const understandingDocumentEntrySchema = w3cDocumentMetaSchema.extend({
   slug: z.string(),
   criterionId: criterionIdSchema,
});
export type UnderstandingDocumentEntry = z.infer<typeof understandingDocumentEntrySchema>;

export const understandingArtifactSchema = z.object({
   version: wcagVersionSchema,
   documents: z.record(z.string(), understandingDocumentEntrySchema),
});
export type UnderstandingArtifact = z.infer<typeof understandingArtifactSchema>;

export const techniqueBodyEntrySchema = w3cDocumentMetaSchema.extend({
   id: z.string(),
});
export type TechniqueBodyEntry = z.infer<typeof techniqueBodyEntrySchema>;

export const techniqueBodyArtifactSchema = z.object({
   version: wcagVersionSchema,
   bodies: z.record(z.string(), techniqueBodyEntrySchema),
});
export type TechniqueBodyArtifact = z.infer<typeof techniqueBodyArtifactSchema>;

/** Content-addressed store of extracted document bodies, keyed by `bodyHash`. */
export const documentContentStoreSchema = z.record(z.string(), z.string().min(1));
export type DocumentContentStore = z.infer<typeof documentContentStoreSchema>;
