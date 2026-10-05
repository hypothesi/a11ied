import { z } from 'zod';

export const criterionIdSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export type CriterionId = z.infer<typeof criterionIdSchema>;

export const criterionSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type CriterionSlug = z.infer<typeof criterionSlugSchema>;

export const criterionLookupKeySchema = z.union([criterionIdSchema, criterionSlugSchema]);
export type CriterionLookupKey = z.infer<typeof criterionLookupKeySchema>;
