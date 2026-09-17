import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
   siteInventorySchema,
   type AuditScope,
   type PageDiscoveryMethod,
   type PageRecord,
   type SiteInventory,
} from '@a11ied/contracts';

import { crawlSameOrigin, normalizeUrl, type PageVisitResult } from './crawl.js';
import { discoverSitemapUrls } from './sitemap.js';

const DEFAULT_MAX_PAGES = 2000;
const DEFAULT_MAX_SITEMAPS = 50;
const HASH_LENGTH = 8;
const HTTP_OK = 200;
const JSON_INDENT = 3;
const PAGE_LABEL_LENGTH = 40;
const PRIVATE_FILE_MODE = 0o600;

export interface DiscoverOptions {
   scope?: AuditScope | undefined;
   sitemapUrl?: string | undefined;
   sitemapOnly?: boolean | undefined;
   maxPages?: number | undefined;
   maxSitemaps?: number | undefined;
   concurrency?: number | undefined;
   timeoutMs?: number | undefined;
   include?: string[] | undefined;
   exclude?: string[] | undefined;
   probeErrorPages?: boolean | undefined;
   storageStatePath?: string | undefined;
   artifactsDir?: string | undefined;
   resumeFrom?: SiteInventory | undefined;
   onProgress?: ((partial: SiteInventory) => Promise<void> | void) | undefined;
}

function slugWithHash(label: string, value: string): string {
   const slug =
      label
         .toLowerCase()
         .replaceAll(/[^a-z0-9]+/gu, '-')
         .replaceAll(/^-|-$/gu, '')
         .slice(0, PAGE_LABEL_LENGTH) || 'page';
   return `${slug}-${createHash('sha256').update(value).digest('hex').slice(0, HASH_LENGTH)}`;
}

export function buildPageId(url: string): string {
   const parsed = new URL(url);
   const label = parsed.pathname.split('/').findLast(Boolean) ?? parsed.hostname;
   return slugWithHash(label, normalizeUrl(url));
}

export function buildOriginKey(url: string): string {
   const origin = new URL(url).origin;
   return slugWithHash(new URL(url).hostname, origin);
}

function recordFromVisit(
   visit: PageVisitResult,
   discoveredVia: PageDiscoveryMethod,
): PageRecord {
   return {
      pageId: buildPageId(visit.finalUrl),
      url: visit.url,
      finalUrl: visit.finalUrl,
      ...(visit.canonicalUrl ? { canonicalUrl: visit.canonicalUrl } : {}),
      status: visit.status,
      discoveredVia,
      ...(visit.title ? { title: visit.title } : {}),
      ...(visit.headingSample ? { headingSample: visit.headingSample } : {}),
      requiresAuth: visit.requiresAuth,
      hasDestructiveActions: visit.hasDestructiveActions,
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
         (candidate) =>
            candidate.pageId !== page.pageId &&
            (candidate.canonicalUrl ?? candidate.finalUrl) === identity,
      );
   if (!original) {
      return page;
   }
   return { ...page, isDuplicateOf: original.pageId, auditStatus: 'skipped-duplicate' };
}

function buildInitialInventory(
   startUrl: string,
   options: DiscoverOptions,
): SiteInventory {
   if (options.resumeFrom) {
      return {
         ...options.resumeFrom,
         generatedAt: new Date().toISOString(),
         run: { ...options.resumeFrom.run, updatedAt: new Date().toISOString() },
      };
   }
   const normalized = normalizeUrl(startUrl),
      now = new Date().toISOString(),
      scope = options.scope ?? 'site';
   return {
      version: '1',
      startUrl: normalized,
      generatedAt: now,
      run: {
         runId: randomUUID(),
         originKey: buildOriginKey(normalized),
         phase: 'discovering',
         startedAt: now,
         updatedAt: now,
         scope,
         ...(scope === 'section' ? { sectionPath: new URL(normalized).pathname } : {}),
         optionsChosen: {
            probeErrorPages: Boolean(options.probeErrorPages),
            parallelAutomatedAudit: false,
            capturePageArtifacts: Boolean(options.artifactsDir),
         },
      },
      discovery: {
         complete: true,
         maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
         maxSitemaps: options.maxSitemaps ?? DEFAULT_MAX_SITEMAPS,
         sources: [],
         failures: [],
      },
      pages: [],
      templates: [],
   };
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
}): Promise<void> {
   const { inventory, onProgress, source, visit } = input;
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
         (inventory.run.scope === 'page' ? 1 : (options.maxPages ?? DEFAULT_MAX_PAGES)) +
         (probeUrl ? 1 : 0),
      timeoutMs: options.timeoutMs,
      seedUrls,
      followLinks: !options.sitemapOnly,
      include: options.include,
      exclude: options.exclude,
      sectionPath,
      onVisit: async (visit): Promise<void> => {
         const source = getDiscoveryMethod(visit, probeUrl, sitemapUrls);
         if (source) {
            await addVisit({ inventory, visit, source, onProgress: options.onProgress });
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
   const candidates = (inventory.run.scope === 'page' ? [normalized] : sitemapUrls)
      .map((url) => normalizeUrl(url))
      .filter((url) => !resolved.has(url));
   const baseSeedUrls = options.sitemapOnly
      ? candidates
      : [...new Set([normalized, ...candidates])].filter((url) => !resolved.has(url));
   const probeUrl = options.probeErrorPages
      ? normalizeUrl(new URL(`/a11ied-404-probe-${randomUUID()}`, normalized).toString())
      : undefined;
   return {
      ...(probeUrl ? { probeUrl } : {}),
      seedUrls: probeUrl ? [...baseSeedUrls, probeUrl] : baseSeedUrls,
      sitemapUrlSet,
   };
}

/** Discovers and resolves the pages in one page, section, or same-origin site. */
export async function discoverSite(
   startUrl: string,
   options: DiscoverOptions = {},
): Promise<SiteInventory> {
   const normalized = normalizeUrl(startUrl);
   const inventory = buildInitialInventory(normalized, options),
      resolved = getResolvedUrls(inventory);
   const sitemap = await discoverSitemapUrls(normalized, {
      ...(options.maxSitemaps ? { maxSitemaps: options.maxSitemaps } : {}),
      ...(options.sitemapUrl ? { sitemapUrl: options.sitemapUrl } : {}),
      ...(options.storageStatePath ? { storageStatePath: options.storageStatePath } : {}),
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
   });
   inventory.discovery.sources = sitemap.sitemaps;
   inventory.discovery.failures.push(...sitemap.failures);

   const { probeUrl, seedUrls, sitemapUrlSet } = getSeedUrls({
      inventory,
      normalized,
      options,
      resolved,
      sitemapUrls: sitemap.urls,
   });
   const crawl = await crawlSameOrigin(
      normalized,
      buildCrawlOptions({
         inventory,
         options,
         probeUrl,
         seedUrls,
         sitemapUrls: sitemapUrlSet,
      }),
   );
   inventory.discovery.failures.push(...crawl.failures);
   inventory.discovery.complete = !sitemap.truncated && !crawl.truncated;
   if (!inventory.discovery.complete) {
      inventory.discovery.truncatedReason = sitemap.truncated
         ? 'Sitemap limit reached.'
         : 'Page limit reached.';
   }

   inventory.run.updatedAt = new Date().toISOString();
   inventory.generatedAt = inventory.run.updatedAt;
   await options.onProgress?.(siteInventorySchema.parse(inventory));
   return siteInventorySchema.parse(inventory);
}

export async function writeInventoryAtomic(
   inventory: SiteInventory,
   path: string,
): Promise<void> {
   const validated = siteInventorySchema.parse(inventory);
   const temporaryPath = `${path}.tmp`;
   await mkdir(dirname(path), { recursive: true });
   const handle = await open(temporaryPath, 'w', PRIVATE_FILE_MODE);
   try {
      await handle.writeFile(
         `${JSON.stringify(validated, undefined, JSON_INDENT)}\n`,
         'utf8',
      );
      await handle.sync();
   } finally {
      await handle.close();
   }
   await rename(temporaryPath, path);
}

export async function readInventory(path: string): Promise<SiteInventory> {
   return siteInventorySchema.parse(JSON.parse(await readFile(path, 'utf8')));
}
