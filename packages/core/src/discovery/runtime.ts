import { randomUUID } from 'node:crypto';

import {
   siteInventorySchema,
   type PageDiscoveryMethod,
   type PageRecord,
   type SiteInventory,
} from '@a11ied/contracts';

import { crawlSameOrigin, normalizeUrl, type PageVisitResult } from './crawl.js';
import { discoverSitemapUrls } from './sitemap.js';

const DEFAULT_MAX_PAGES = 2000;
const DEFAULT_MAX_SITEMAPS = 50;
const HTTP_OK = 200;

import {
   buildInitialInventory,
   buildPageId,
   getEffectiveOptions,
   type DiscoverOptions,
} from './inventory.js';

export {
   buildOriginKey,
   buildPageId,
   readInventory,
   writeInventoryAtomic,
   type DiscoverOptions,
} from './inventory.js';

function recordFromVisit(
   visit: PageVisitResult,
   discoveredVia: PageDiscoveryMethod,
): PageRecord {
   return {
      pageId: buildPageId(visit.url),
      url: visit.url,
      finalUrl: visit.finalUrl,
      ...(visit.canonicalUrl ? { canonicalUrl: visit.canonicalUrl } : {}),
      status: visit.status,
      discoveredVia,
      ...(visit.title ? { title: visit.title } : {}),
      ...(visit.headingSample ? { headingSample: visit.headingSample } : {}),
      requiresAuth: visit.requiresAuth,
      hasDestructiveActions: visit.hasDestructiveActions,
      links: visit.links,
      discoveryStatus: visit.error ? 'error' : 'resolved',
      auditStatus: visit.error ? 'error' : 'not-tested',
      ...(visit.error ? { error: visit.error } : {}),
      ...(visit.htmlArtifactPath ? { htmlArtifactPath: visit.htmlArtifactPath } : {}),
      ...(visit.accessibilityTreeArtifactPath
         ? { accessibilityTreeArtifactPath: visit.accessibilityTreeArtifactPath }
         : {}),
   };
}

function markDuplicate(page: PageRecord, pages: PageRecord[]): PageRecord {
   const identity = page.canonicalUrl ?? page.finalUrl,
      original = pages.find(
         (candidate) => (candidate.canonicalUrl ?? candidate.finalUrl) === identity,
      );
   if (!original) {
      return page;
   }
   return { ...page, isDuplicateOf: original.pageId, auditStatus: 'skipped-duplicate' };
}

function getResolvedUrls(inventory: SiteInventory): Set<string> {
   return new Set(
      inventory.pages
         .filter(
            (page) =>
               page.discoveryStatus === 'resolved' || page.discoveryStatus === 'error',
         )
         .flatMap((page) => [page.url, page.finalUrl].map((url) => normalizeUrl(url))),
   );
}

async function addVisit(input: {
   inventory: SiteInventory;
   onProgress: DiscoverOptions['onProgress'];
   source: PageDiscoveryMethod;
   visit: PageVisitResult;
   pendingUrls: string[];
}): Promise<void> {
   const { inventory, onProgress, source, visit } = input;
   inventory.discovery.pendingUrls = input.pendingUrls;
   const existing = inventory.pages.find(
      (page) => normalizeUrl(page.url) === normalizeUrl(visit.url),
   );
   if (existing) {
      return;
   }
   const record = markDuplicate(recordFromVisit(visit, source), inventory.pages);
   inventory.pages.push(record);
   inventory.run.updatedAt = new Date().toISOString();
   inventory.generatedAt = inventory.run.updatedAt;
   await onProgress?.(siteInventorySchema.parse(inventory));
}

function getDiscoveryMethod(
   visit: PageVisitResult,
   probeUrl: string | undefined,
   sitemapUrls: Set<string>,
): PageDiscoveryMethod | undefined {
   const normalizedUrl = normalizeUrl(visit.url);
   const isProbe = probeUrl === normalizedUrl;
   if (
      isProbe &&
      visit.status === HTTP_OK &&
      !/(?:404|not found)/iu.test(`${visit.title ?? ''} ${visit.headingSample ?? ''}`)
   ) {
      return undefined;
   }
   if (isProbe) {
      return 'error-probe';
   }
   return sitemapUrls.has(normalizedUrl) ? 'sitemap' : 'crawl';
}

function buildCrawlOptions(input: {
   inventory: SiteInventory;
   options: DiscoverOptions;
   probeUrl?: string | undefined;
   seedUrls: string[];
   sitemapUrls: Set<string>;
}): Parameters<typeof crawlSameOrigin>[1] {
   const { inventory, options, probeUrl, seedUrls, sitemapUrls } = input,
      sectionPath =
         inventory.run.scope === 'section' ? inventory.run.sectionPath : undefined;
   return {
      storageStatePath: options.storageStatePath,
      artifactsDir: options.artifactsDir,
      concurrency: options.concurrency,
      maxPages:
         Math.max(
            0,
            (inventory.run.scope === 'page' ? 1 : inventory.discovery.maxPages) -
               inventory.pages.filter((page) => page.discoveredVia !== 'error-probe')
                  .length,
         ) + (probeUrl ? 1 : 0),
      timeoutMs: options.timeoutMs,
      seedUrls,
      resolvedUrls: [...getResolvedUrls(inventory)],
      followLinks: inventory.run.scope !== 'page' && !options.sitemapOnly,
      include: options.include,
      exclude: options.exclude,
      sectionPath,
      onVisit: async (visit, pendingUrls): Promise<void> => {
         const source = getDiscoveryMethod(visit, probeUrl, sitemapUrls);
         if (source) {
            await addVisit({
               inventory,
               visit,
               source,
               pendingUrls,
               onProgress: options.onProgress,
            });
         }
      },
   };
}

function getSeedUrls(input: {
   inventory: SiteInventory;
   normalized: string;
   options: DiscoverOptions;
   resolved: Set<string>;
   sitemapUrls: string[];
}): { probeUrl?: string | undefined; seedUrls: string[]; sitemapUrlSet: Set<string> } {
   const { inventory, normalized, options, resolved, sitemapUrls } = input,
      sitemapUrlSet = new Set(sitemapUrls.map((url) => normalizeUrl(url)));
   const storedLinks = inventory.pages.flatMap((page) => page.links ?? []);
   const candidates = (
      inventory.run.scope === 'page'
         ? [normalized]
         : [...inventory.discovery.pendingUrls, ...sitemapUrls, ...storedLinks]
   )
      .map((url) => normalizeUrl(url))
      .filter((url) => !resolved.has(url));
   const baseSeedUrls = options.sitemapOnly
      ? candidates
      : [...new Set([normalized, ...candidates])].filter((url) => !resolved.has(url));
   const probePath = inventory.run.sectionPath?.replace(/\/$/u, '') ?? '';
   const probeUrl =
      options.probeErrorPages &&
      !inventory.pages.some((page) => page.discoveredVia === 'error-probe')
         ? normalizeUrl(
              new URL(
                 `${probePath}/a11ied-404-probe-${randomUUID()}`,
                 normalized,
              ).toString(),
           )
         : undefined;
   return {
      ...(probeUrl ? { probeUrl } : {}),
      seedUrls: probeUrl ? [...baseSeedUrls, probeUrl] : baseSeedUrls,
      sitemapUrlSet,
   };
}

function applyDiscoveryOptions(inventory: SiteInventory, options: DiscoverOptions): void {
   inventory.discovery.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
   inventory.discovery.maxSitemaps = options.maxSitemaps ?? DEFAULT_MAX_SITEMAPS;
   Object.assign(inventory.run.optionsChosen, {
      include: options.include,
      exclude: options.exclude,
      sitemapOnly: options.sitemapOnly,
      sitemapUrl: options.sitemapUrl,
      probeErrorPages: Boolean(options.probeErrorPages),
   });
}

function finishDiscovery(
   inventory: SiteInventory,
   input: {
      sitemapTruncated: boolean;
      crawl: Awaited<ReturnType<typeof crawlSameOrigin>>;
      missingFrontier: boolean;
   },
): void {
   inventory.discovery.failures.push(...input.crawl.failures);
   inventory.run.updatedAt = new Date().toISOString();
   inventory.generatedAt = inventory.run.updatedAt;
   inventory.discovery.pendingUrls = input.crawl.pendingUrls;
   const hasPageErrors = inventory.pages.some((page) => page.discoveryStatus === 'error');
   inventory.discovery.complete =
      !input.sitemapTruncated &&
      !input.crawl.truncated &&
      !input.missingFrontier &&
      !hasPageErrors;
   delete inventory.discovery.truncatedReason;
   if (input.sitemapTruncated) {
      inventory.discovery.truncatedReason = 'Sitemap limit reached.';
   } else if (input.crawl.truncated) {
      inventory.discovery.truncatedReason = 'Page limit reached.';
   } else if (input.missingFrontier) {
      inventory.discovery.truncatedReason =
         'The saved crawl frontier is missing. Start discovery in a new run.';
   } else if (hasPageErrors) {
      inventory.discovery.truncatedReason = 'Page discovery failed for one or more URLs.';
   }
}

/** Discovers and resolves the pages in one page, section, or same-origin site. */
export async function discoverSite(
   startUrl: string,
   options: DiscoverOptions = {},
): Promise<SiteInventory> {
   const normalized = normalizeUrl(startUrl);
   const inventory = buildInitialInventory(normalized, options);
   const effective = getEffectiveOptions(inventory, options),
      resolved = getResolvedUrls(inventory);
   applyDiscoveryOptions(inventory, effective);
   const sitemap =
      inventory.run.scope === 'page'
         ? { urls: [], sitemaps: [], failures: [], truncated: false }
         : await discoverSitemapUrls(normalized, {
              maxSitemaps: inventory.discovery.maxSitemaps,
              ...(effective.sitemapUrl ? { sitemapUrl: effective.sitemapUrl } : {}),
              ...(options.storageStatePath
                 ? { storageStatePath: options.storageStatePath }
                 : {}),
              ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
           });
   inventory.discovery.sources = sitemap.sitemaps;
   inventory.discovery.failures.push(...sitemap.failures);

   const { probeUrl, seedUrls, sitemapUrlSet } = getSeedUrls({
      inventory,
      normalized,
      options: effective,
      resolved,
      sitemapUrls: sitemap.urls,
   });
   const missingFrontier = Boolean(
      options.resumeFrom &&
      !options.resumeFrom.discovery.complete &&
      inventory.run.scope !== 'page' &&
      seedUrls.length === 0 &&
      inventory.pages.every((page) => page.links === undefined),
   );
   inventory.discovery.pendingUrls = seedUrls;
   await options.onProgress?.(siteInventorySchema.parse(inventory));
   const crawl = await crawlSameOrigin(
      normalized,
      buildCrawlOptions({
         inventory,
         options: effective,
         probeUrl,
         seedUrls,
         sitemapUrls: sitemapUrlSet,
      }),
   );
   finishDiscovery(inventory, {
      sitemapTruncated: sitemap.truncated,
      crawl,
      missingFrontier,
   });

   await options.onProgress?.(siteInventorySchema.parse(inventory));
   return siteInventorySchema.parse(inventory);
}
