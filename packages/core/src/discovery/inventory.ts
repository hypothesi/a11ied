import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
   siteInventorySchema,
   type AuditScope,
   type SiteInventory,
} from '@a11ied/contracts';
import { normalizeUrl } from './crawl.js';
import { getCanonicalPath, withFileLock, writeJsonAtomic } from '../files/atomic-json.js';

const DEFAULT_MAX_PAGES = 2000;
const DEFAULT_MAX_SITEMAPS = 50;
const HASH_LENGTH = 8;
const PAGE_LABEL_LENGTH = 40;

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

export function buildInitialInventory(
   startUrl: string,
   options: DiscoverOptions,
): SiteInventory {
   if (options.resumeFrom) {
      const inventory = siteInventorySchema.parse(options.resumeFrom);
      return {
         ...inventory,
         generatedAt: new Date().toISOString(),
         run: {
            ...inventory.run,
            phase: 'discovering',
            updatedAt: new Date().toISOString(),
         },
         discovery: { ...inventory.discovery, complete: false },
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
            ...(options.include ? { include: options.include } : {}),
            ...(options.exclude ? { exclude: options.exclude } : {}),
            ...(options.sitemapOnly === undefined
               ? {}
               : { sitemapOnly: options.sitemapOnly }),
            ...(options.sitemapUrl ? { sitemapUrl: options.sitemapUrl } : {}),
         },
      },
      discovery: {
         complete: false,
         maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
         maxSitemaps: options.maxSitemaps ?? DEFAULT_MAX_SITEMAPS,
         sources: [],
         failures: [],
         pendingUrls: [],
      },
      pages: [],
      templates: [],
   };
}

export function getEffectiveOptions(
   inventory: SiteInventory,
   options: DiscoverOptions,
): DiscoverOptions {
   const chosen = inventory.run.optionsChosen;
   return {
      ...options,
      include: options.include ?? chosen.include,
      exclude: options.exclude ?? chosen.exclude,
      sitemapOnly: options.sitemapOnly ?? chosen.sitemapOnly,
      sitemapUrl: options.sitemapUrl ?? chosen.sitemapUrl,
      probeErrorPages: options.probeErrorPages ?? chosen.probeErrorPages,
      maxPages: options.maxPages ?? inventory.discovery.maxPages,
      maxSitemaps: options.maxSitemaps ?? inventory.discovery.maxSitemaps,
   };
}

export async function readInventory(path: string): Promise<SiteInventory> {
   return siteInventorySchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

async function readExistingInventory(path: string): Promise<SiteInventory | undefined> {
   try {
      return await readInventory(path);
   } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
         return undefined;
      }
      throw error;
   }
}

/** Preserve linked assessment metadata when discovery writes another page snapshot. */
export async function writeInventoryAtomic(
   inventory: SiteInventory,
   path: string,
): Promise<void> {
   const canonicalPath = await getCanonicalPath(path),
      validated = siteInventorySchema.parse(inventory);
   await withFileLock(canonicalPath, async () => {
      const current = await readExistingInventory(canonicalPath);
      if (current?.run.runId === validated.run.runId) {
         validated.run.assessmentFile ??= current.run.assessmentFile;
         validated.run.profile ??= current.run.profile;
      }
      await writeJsonAtomic(validated, canonicalPath);
   });
}

/** Apply an inventory mutation to the current locked snapshot instead of an earlier copy. */
export async function updateInventoryAtomic(input: {
   path: string;
   change: (inventory: SiteInventory) => SiteInventory | Promise<SiteInventory>;
}): Promise<SiteInventory> {
   const path = await getCanonicalPath(input.path);
   return withFileLock(path, async () => {
      const current = await readInventory(path),
         next = siteInventorySchema.parse(await input.change(current));
      if (current.run.runId !== next.run.runId || current.startUrl !== next.startUrl) {
         throw new Error(
            'An inventory mutation cannot replace the run identity or target.',
         );
      }
      await writeJsonAtomic(next, path);
      return next;
   });
}
