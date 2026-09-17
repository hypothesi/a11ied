import { siteInventorySchema, type SiteInventory } from '@a11ied/contracts';

export function buildReportTestInventory(): SiteInventory {
   return siteInventorySchema.parse({
      version: '1',
      startUrl: 'https://example.test/',
      generatedAt: '2026-09-16T12:00:00.000Z',
      run: {
         runId: 'run-1',
         originKey: 'example-test-a1b2c3d4',
         phase: 'report-building',
         startedAt: '2026-09-16T12:00:00.000Z',
         updatedAt: '2026-09-16T12:05:00.000Z',
         scope: 'site',
         optionsChosen: {
            auditMode: 'full',
            probeErrorPages: true,
            parallelAutomatedAudit: false,
            capturePageArtifacts: false,
         },
      },
      discovery: {
         complete: true,
         maxPages: 2000,
         maxSitemaps: 50,
         sources: [],
         failures: [],
      },
      pages: [
         {
            pageId: 'home-a1b2c3d4',
            url: 'https://example.test/',
            finalUrl: 'https://example.test/',
            status: 200,
            discoveredVia: 'crawl',
            requiresAuth: false,
            hasDestructiveActions: false,
            discoveryStatus: 'resolved',
            auditStatus: 'audited',
         },
      ],
      templates: [],
   });
}
