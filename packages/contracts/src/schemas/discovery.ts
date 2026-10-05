import { z } from 'zod';
import { auditProfileSchema } from './audit-run.js';

const HTTP_MAX_STATUS = 599;
const HTTP_MIN_STATUS = 100;

export const pageDiscoveryMethodSchema = z.enum([
   'sitemap',
   'crawl',
   'manual',
   'error-probe',
]);
export type PageDiscoveryMethod = z.infer<typeof pageDiscoveryMethodSchema>;

export const pageDiscoveryStatusSchema = z.enum(['pending', 'resolved', 'error']);
export type PageDiscoveryStatus = z.infer<typeof pageDiscoveryStatusSchema>;

export const pageAuditStatusSchema = z.enum([
   'not-tested',
   'in-progress',
   'audited',
   'skipped-duplicate',
   'error',
]);
export type PageAuditStatus = z.infer<typeof pageAuditStatusSchema>;

export const violationCountsSchema = z.object({
   minor: z.number().int().nonnegative(),
   moderate: z.number().int().nonnegative(),
   serious: z.number().int().nonnegative(),
   critical: z.number().int().nonnegative(),
});
export type ViolationCounts = z.infer<typeof violationCountsSchema>;

export const pageRecordSchema = z.object({
   pageId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
   url: z.string().url(),
   finalUrl: z.string().url(),
   canonicalUrl: z.string().url().optional(),
   status: z.union([
      z.number().int().min(HTTP_MIN_STATUS).max(HTTP_MAX_STATUS),
      z.literal('error'),
   ]),
   discoveredVia: pageDiscoveryMethodSchema,
   title: z.string().optional(),
   headingSample: z.string().optional(),
   links: z.array(z.string().url()).optional(),
   templateId: z.string().min(1).optional(),
   isDuplicateOf: z.string().min(1).optional(),
   requiresAuth: z.boolean(),
   hasDestructiveActions: z.boolean(),
   discoveryStatus: pageDiscoveryStatusSchema,
   auditStatus: pageAuditStatusSchema,
   error: z.object({ code: z.string().min(1), message: z.string().min(1) }).optional(),
   htmlArtifactPath: z.string().min(1).optional(),
   accessibilityTreeArtifactPath: z.string().min(1).optional(),
   auditedAt: z.string().datetime().optional(),
   violationCounts: violationCountsSchema.optional(),
});
export type PageRecord = z.infer<typeof pageRecordSchema>;

export const auditScopeSchema = z.enum(['page', 'section', 'site']);
export type AuditScope = z.infer<typeof auditScopeSchema>;

export const siteInventorySchema = z
   .object({
      version: z.literal('1'),
      startUrl: z.string().url(),
      generatedAt: z.string().datetime(),
      run: z.object({
         runId: z.string().min(1),
         assessmentFile: z.string().min(1).optional(),
         profile: auditProfileSchema.optional(),
         originKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
         phase: z.enum([
            'discovering',
            'template-review',
            'auditing',
            'report-building',
            'complete',
         ]),
         startedAt: z.string().datetime(),
         updatedAt: z.string().datetime(),
         scope: auditScopeSchema,
         sectionPath: z.string().optional(),
         optionsChosen: z.object({
            auditMode: z.enum(['full', 'sampled']).optional(),
            probeErrorPages: z.boolean(),
            parallelAutomatedAudit: z.boolean(),
            capturePageArtifacts: z.boolean(),
            evidenceFile: z.string().min(1).optional(),
            selectedPageIds: z.array(z.string().min(1)).optional(),
            include: z.array(z.string()).optional(),
            exclude: z.array(z.string()).optional(),
            sitemapOnly: z.boolean().optional(),
            sitemapUrl: z.string().url().optional(),
         }),
      }),
      discovery: z.object({
         complete: z.boolean(),
         truncatedReason: z.string().min(1).optional(),
         maxPages: z.number().int().positive(),
         maxSitemaps: z.number().int().positive(),
         sources: z.array(z.string().url()),
         failures: z.array(z.object({ source: z.string(), message: z.string().min(1) })),
         pendingUrls: z.array(z.string().url()).default([]),
      }),
      pages: z.array(pageRecordSchema),
      templates: z.array(
         z.object({
            templateId: z.string().min(1),
            representativePageId: z.string().min(1),
            memberPageIds: z.array(z.string().min(1)),
         }),
      ),
   })
   .superRefine((inventory, context) => {
      const ids = new Set<string>();
      for (const page of inventory.pages) {
         if (ids.has(page.pageId)) {
            context.addIssue({
               code: 'custom',
               message: `Duplicate page ID: ${page.pageId}`,
               path: ['pages'],
            });
         }
         ids.add(page.pageId);
      }
      for (const page of inventory.pages) {
         if (
            page.isDuplicateOf &&
            (page.isDuplicateOf === page.pageId || !ids.has(page.isDuplicateOf))
         ) {
            context.addIssue({
               code: 'custom',
               message: `Invalid duplicate reference: ${page.pageId}`,
               path: ['pages'],
            });
         }
      }
   });
export type SiteInventory = z.infer<typeof siteInventorySchema>;
