import { z } from 'zod';

import { auditScopeSchema, violationCountsSchema } from './discovery.js';
import { evidenceRecordSchema } from './evidence.js';

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
   ruleId: z.string().min(1).optional(),
   title: z.string().min(1).optional(),
   source: z.enum(['axe', 'behavioral']).default('axe'),
   impact: z.enum(['minor', 'moderate', 'serious', 'critical', 'unknown']),
   description: z.string(),
   guidance: z.string(),
   helpUrl: z.string().url().optional(),
   criterionIds: z.array(z.string()),
   selectors: z.array(z.string()),
   evidence: evidenceRecordSchema.optional(),
   context: z
      .object({
         scope: z.string(),
         states: z.array(z.string()),
         journeys: z.array(z.string()),
         environment: z.string(),
         setup: z.array(z.string()).default([]),
         limitations: z.array(z.string()).default([]),
      })
      .optional(),
   reproduction: z.array(z.string()).default([]),
   artifactLinks: z.array(z.object({ kind: z.string(), href: z.string() })).default([]),
});
export type ReportFinding = z.infer<typeof reportFindingSchema>;

export const reportCriterionSchema = z.object({
   criterionId: z.string().min(1),
   title: z.string(),
   level: z.string(),
   outcome: reportOutcomeSchema,
   pending: z.boolean().default(true),
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
   recorded: z.array(evidenceRecordSchema).default([]),
   findings: z.array(reportFindingSchema),
   violationCounts: violationCountsSchema,
   error: z.string().optional(),
});
export type ReportPage = z.infer<typeof reportPageSchema>;

const assessmentProgressSchema = z.object({
   id: z.string().min(1),
   label: z.string(),
   total: z.number().int().nonnegative(),
   assessed: z.number().int().nonnegative(),
   unresolved: z.number().int().nonnegative(),
   complete: z.boolean(),
});

export const reportModelSchema = z.object({
   version: z.literal('1'),
   status: z.enum(['draft', 'final']).default('final'),
   title: z.string().min(1),
   generatedAt: z.string().datetime(),
   startUrl: z.string().url(),
   scope: auditScopeSchema,
   assessment: z
      .object({
         runId: z.string().min(1),
         revision: z.number().int().nonnegative(),
         complete: z.boolean(),
         coverage: z.object({
            total: z.number().int().nonnegative(),
            attempted: z.number().int().nonnegative(),
            assessed: z.number().int().nonnegative(),
            unresolved: z.number().int().nonnegative(),
         }),
         issues: z.array(
            z.object({
               code: z.string().min(1),
               message: z.string(),
               checkId: z.string().optional(),
               criterionId: z.string().optional(),
            }),
         ),
         progress: z.object({
            pages: z.array(assessmentProgressSchema),
            states: z.array(assessmentProgressSchema),
            journeys: z.array(assessmentProgressSchema),
         }),
      })
      .optional(),
   discovery: z.object({
      complete: z.boolean(),
      gaps: z.array(z.string()),
      discoveredPages: z.number().int().nonnegative(),
      scannedPages: z.number().int().nonnegative().default(0),
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
