import { describe, expect, it } from 'vitest';

import { siteInventorySchema } from './discovery.js';

function buildInventory(): unknown {
   return {
      version: '1',
      startUrl: 'https://example.test/',
      generatedAt: '2026-09-16T12:00:00.000Z',
      run: {
         runId: 'run-1',
         originKey: 'example-test-a1b2c3d4',
         phase: 'auditing',
         startedAt: '2026-09-16T12:00:00.000Z',
         updatedAt: '2026-09-16T12:05:00.000Z',
         scope: 'site',
         optionsChosen: {
            auditMode: 'sampled',
            probeErrorPages: false,
            parallelAutomatedAudit: true,
            capturePageArtifacts: true,
         },
      },
      discovery: {
         complete: false,
         truncatedReason: 'Page limit reached.',
         maxPages: 50,
         maxSitemaps: 10,
         sources: ['https://example.test/sitemap.xml'],
         failures: [],
      },
      pages: [
         {
            pageId: 'account-a1b2c3d4',
            url: 'https://example.test/account',
            finalUrl: 'https://example.test/login',
            status: 200,
            discoveredVia: 'crawl',
            requiresAuth: true,
            hasDestructiveActions: false,
            discoveryStatus: 'resolved',
            auditStatus: 'not-tested',
            htmlArtifactPath: 'account/snapshot.html',
         },
      ],
      templates: [],
   };
}

describe('siteInventorySchema', () => {
   it('accepts a partial sampled authenticated inventory', () => {
      const parsed = siteInventorySchema.parse(buildInventory());

      expect(parsed.discovery.complete).toStrictEqual(false);
      expect(parsed.pages[0]?.requiresAuth).toStrictEqual(true);
   });

   it('rejects unsafe page ids', () => {
      const inventory = siteInventorySchema.parse(buildInventory()),
         page = inventory.pages[0];
      if (!page) {
         throw new Error('Fixture has no page.');
      }
      page.pageId = '../secret';

      expect(() => siteInventorySchema.parse(inventory)).toThrow();
   });
});
