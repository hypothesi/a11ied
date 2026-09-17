import { auditScopeSchema, type SiteInventory } from '@a11ied/contracts';
import { discoverSite, readInventory, writeInventoryAtomic } from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { activeAnnotations, createToolResponse } from '../lib/shared.js';

const auditDiscoverInputSchema = z.object({
   url: z.string().url(),
   scope: auditScopeSchema.default('site'),
   sitemapUrl: z.string().url().optional(),
   sitemapOnly: z.boolean().optional(),
   maxPages: z.number().int().positive().optional(),
   maxSitemaps: z.number().int().positive().optional(),
   concurrency: z.number().int().positive().optional(),
   timeoutMs: z.number().int().positive().optional(),
   include: z.array(z.string()).optional(),
   exclude: z.array(z.string()).optional(),
   probeErrorPages: z.boolean().optional(),
   resumeFromPath: z.string().min(1).optional(),
   storageStatePath: z.string().min(1).optional(),
   artifactsDir: z.string().min(1).optional(),
   outPath: z.string().min(1).optional(),
});

export function registerAuditDiscoverTool(server: McpServer): void {
   server.registerTool(
      'audit_discover',
      {
         title: 'Discover pages for an accessibility audit',
         description:
            'Build a deduplicated, resumable inventory from sitemaps and rendered same-origin links.',
         inputSchema: auditDiscoverInputSchema,
         annotations: activeAnnotations,
      },
      async (input) => {
         const resumeFrom = input.resumeFromPath
            ? await readInventory(input.resumeFromPath)
            : undefined;
         const result = await discoverSite(input.url, {
            artifactsDir: input.artifactsDir,
            concurrency: input.concurrency,
            exclude: input.exclude,
            include: input.include,
            maxPages: input.maxPages,
            maxSitemaps: input.maxSitemaps,
            onProgress: input.outPath
               ? async (inventory: SiteInventory): Promise<void> =>
                    writeInventoryAtomic(inventory, input.outPath ?? '')
               : undefined,
            probeErrorPages: input.probeErrorPages,
            resumeFrom,
            scope: input.scope,
            sitemapOnly: input.sitemapOnly,
            sitemapUrl: input.sitemapUrl,
            storageStatePath: input.storageStatePath,
            timeoutMs: input.timeoutMs,
         });
         if (input.outPath) {
            await writeInventoryAtomic(result, input.outPath);
         }
         return createToolResponse({ result, outputPath: input.outPath });
      },
   );
}
