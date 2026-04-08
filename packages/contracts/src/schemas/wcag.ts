import { z } from 'zod';

import { wcagLevelSchema, wcagVersionSchema } from './core.js';

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
   url: z.string().url(),
   wcagVersion: wcagVersionSchema,
   selection: axeSelectionSchema,
   ruleIds: z.array(z.string()),
   violations: z.array(axeRuleResultSchema),
   passes: z.array(axeRuleResultSchema),
   incomplete: z.array(axeRuleResultSchema),
   inapplicable: z.array(axeRuleResultSchema),
});
export type AxeRunResult = z.infer<typeof axeRunResultSchema>;

export const coverageStateSchema = z.enum(['automated', 'hybrid', 'manual', 'unknown']);
export type CoverageState = z.infer<typeof coverageStateSchema>;

export const preferredEvidenceModeSchema = z.enum([
   'automated',
   'hybrid',
   'manual',
   'unknown',
]);
export type PreferredEvidenceMode = z.infer<typeof preferredEvidenceModeSchema>;

export const applicabilityStateSchema = z.enum([
   'applicable',
   'likely-applicable',
   'not-detected',
   'out-of-scope',
   'unknown',
]);
export type ApplicabilityState = z.infer<typeof applicabilityStateSchema>;

export const normalizedTechniqueSchema = z.object({
   key: z.string(),
   id: z.string().optional(),
   title: z.string(),
   technology: z.string().optional(),
   kind: z.enum(['sufficient', 'advisory', 'failure']),
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

export const techniqueIndexEntrySchema = z.object({
   key: z.string(),
   id: z.string().optional(),
   title: z.string(),
   technology: z.string().optional(),
   kind: z.enum(['sufficient', 'advisory', 'failure']),
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

export const tagIndexArtifactSchema = z.object({
   version: wcagVersionSchema,
   tags: z.record(z.string(), z.array(z.string())),
});
export type TagIndexArtifact = z.infer<typeof tagIndexArtifactSchema>;

export const criterionCoverageSchema = z.object({
   criterionId: z.string(),
   coverageState: coverageStateSchema,
   axeRuleIds: z.array(z.string()),
   actRuleIds: z.array(z.string()),
   sourceAttribution: z.array(z.string()),
   notes: z.array(z.string()),
   updatedAt: z.string().datetime(),
});
export type CriterionCoverage = z.infer<typeof criterionCoverageSchema>;

export const coverageArtifactSchema = z.object({
   version: wcagVersionSchema,
   coverage: z.record(z.string(), criterionCoverageSchema),
});
export type CoverageArtifact = z.infer<typeof coverageArtifactSchema>;

export const verificationStrategySchema = z.object({
   criterionId: z.string(),
   preferredEvidenceMode: preferredEvidenceModeSchema,
   procedureIds: z.array(z.string()),
   requiresRealTarget: z.boolean(),
   notes: z.array(z.string()),
});
export type VerificationStrategy = z.infer<typeof verificationStrategySchema>;

export const strategyArtifactSchema = z.object({
   version: wcagVersionSchema,
   strategies: z.record(z.string(), verificationStrategySchema),
});
export type StrategyArtifact = z.infer<typeof strategyArtifactSchema>;

const coverageSummaryBucketSchema = z.object({
   criteria: z.number().int().nonnegative(),
   automated: z.number().int().nonnegative(),
   hybrid: z.number().int().nonnegative(),
   manual: z.number().int().nonnegative(),
   unknown: z.number().int().nonnegative(),
});

export const coverageSummaryArtifactSchema = z.object({
   version: wcagVersionSchema,
   updatedAt: z.string().datetime(),
   totals: coverageSummaryBucketSchema,
   byLevel: z.object({
      [LEVEL_A]: coverageSummaryBucketSchema,
      AA: coverageSummaryBucketSchema,
      AAA: coverageSummaryBucketSchema,
   }),
   coverageSources: z.object({
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
export type CoverageSummaryArtifact = z.infer<typeof coverageSummaryArtifactSchema>;
