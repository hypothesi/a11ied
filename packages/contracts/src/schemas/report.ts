import { z } from 'zod';

import { auditScopeSchema, violationCountsSchema } from './discovery.js';

export const reportFormatSchema = z.enum(['html', 'pdf', 'earl', 'json']);
export type ReportFormat = z.infer<typeof reportFormatSchema>;

export const reportOutcomeSchema = z.enum([
   'passed',
   'failed',
   'cantTell',
   'notTested',
   'inapplicable',
]);
export type ReportOutcome = z.infer<typeof reportOutcomeSchema>;

export const reportFindingSchema = z.object({
   ruleId: z.string().min(1),
   impact: z.enum(['minor', 'moderate', 'serious', 'critical']),
   description: z.string(),
   guidance: z.string(),
   helpUrl: z.string().url(),
   criterionIds: z.array(z.string()),
   selectors: z.array(z.string()),
});
export type ReportFinding = z.infer<typeof reportFindingSchema>;

export const reportCriterionSchema = z.object({
   criterionId: z.string().min(1),
   title: z.string(),
   level: z.string(),
   outcome: reportOutcomeSchema,
   testMethod: z.enum(['automated', 'hybrid', 'manual', 'unknown']),
});
export type ReportCriterion = z.infer<typeof reportCriterionSchema>;

export const reportPageSchema = z.object({
   pageId: z.string().min(1),
   url: z.string().url(),
   title: z.string().optional(),
   status: z.union([z.number().int(), z.literal('error')]),
   templateId: z.string().optional(),
   auditStatus: z.string(),
   criteria: z.array(reportCriterionSchema),
   findings: z.array(reportFindingSchema),
   violationCounts: violationCountsSchema,
   error: z.string().optional(),
});
export type ReportPage = z.infer<typeof reportPageSchema>;

export const reportModelSchema = z.object({
   version: z.literal('1'),
   title: z.string().min(1),
   generatedAt: z.string().datetime(),
   startUrl: z.string().url(),
   scope: auditScopeSchema,
   discovery: z.object({
      complete: z.boolean(),
      gaps: z.array(z.string()),
      discoveredPages: z.number().int().nonnegative(),
      auditedPages: z.number().int().nonnegative(),
   }),
   methodology: z.object({
      automated: z.boolean(),
      hybrid: z.boolean(),
      manual: z.boolean(),
      statement: z.string().min(1),
   }),
   totals: z.object({
      outcomes: z.object({
         passed: z.number().int().nonnegative(),
         failed: z.number().int().nonnegative(),
         cantTell: z.number().int().nonnegative(),
         notTested: z.number().int().nonnegative(),
         inapplicable: z.number().int().nonnegative(),
      }),
      violations: violationCountsSchema,
   }),
   templates: z.array(
      z.object({
         templateId: z.string().min(1),
         representativePageId: z.string().min(1),
         auditedPageIds: z.array(z.string()),
         notTestedPageIds: z.array(z.string()),
      }),
   ),
   pages: z.array(reportPageSchema),
   warnings: z.array(z.string()),
});
export type ReportModel = z.infer<typeof reportModelSchema>;
