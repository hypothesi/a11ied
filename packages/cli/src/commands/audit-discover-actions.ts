import { auditScopeSchema, cliExitCodes, type SiteInventory } from '#contracts';
import { discoverSite, readInventory, writeInventoryAtomic } from '#core';

export interface AuditDiscoverActionOptions {
   json?: boolean;
   verbose?: boolean;
   scope?: string;
   sitemap?: string;
   sitemapOnly?: boolean;
   maxPages?: string;
   maxSitemaps?: string;
   concurrency?: string;
   timeout?: string;
   include?: string[];
   exclude?: string[];
   probeErrorPages?: boolean;
   resumeFrom?: string;
   artifactsDir?: string;
   storageState?: string;
   out?: string;
}

function optionalNumber(value: string | undefined): number | undefined {
   return value === undefined ? undefined : Number.parseInt(value, 10);
}

export async function handleAuditDiscoverAction(
   url: string,
   options: AuditDiscoverActionOptions,
): Promise<{ result: SiteInventory; exitCode: number }> {
   const concurrency = optionalNumber(options.concurrency),
      maxPages = optionalNumber(options.maxPages),
      maxSitemaps = optionalNumber(options.maxSitemaps),
      resumeFrom = options.resumeFrom
         ? await readInventory(options.resumeFrom)
         : undefined,
      timeoutMs = optionalNumber(options.timeout);
   const result = await discoverSite(url, {
      artifactsDir: options.artifactsDir,
      concurrency,
      exclude: options.exclude,
      include: options.include,
      maxPages,
      maxSitemaps,
      onProgress: options.out
         ? async (inventory: SiteInventory): Promise<void> =>
              writeInventoryAtomic(inventory, options.out ?? '')
         : undefined,
      probeErrorPages: options.probeErrorPages,
      resumeFrom,
      scope: options.scope ? auditScopeSchema.parse(options.scope) : undefined,
      sitemapOnly: options.sitemapOnly,
      sitemapUrl: options.sitemap,
      storageStatePath: options.storageState,
      timeoutMs,
   });
   if (options.out) {
      await writeInventoryAtomic(result, options.out);
   }
   return { result, exitCode: cliExitCodes.success };
}
