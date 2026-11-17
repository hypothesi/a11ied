import { addPage, getConfig, listPages, type Audit } from '@a11ied/audit';
import { discoverSite } from '../discovery/runtime.js';

const DEFAULT_MAX_PAGES = 50;
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 399;

export interface DiscoverPagesOptions {
   /** Where to start. Defaults to the audit target. */
   url?: string | undefined;
   maxPages?: number | undefined;
   include?: string[] | undefined;
   exclude?: string[] | undefined;
   /** A Playwright storage-state file for pages behind a login. */
   storageStatePath?: string | undefined;
   /** List what would be added without adding it. */
   dryRun?: boolean | undefined;
}

export interface DiscoveredPages {
   found: number;
   added: string[];
   /** Added pages that did not load during discovery, each with the error. */
   unloaded: string[];
   /** Pages found that the audit already had. */
   alreadyPresent: number;
   skipped: string[];
}

function firstLine(message = 'did not load'): string {
   return message.split('\n').at(0) ?? message;
}

function describeNotes(page: {
   status: number | 'error';
   requiresAuth: boolean;
}): string | undefined {
   if (page.status === 'error') {
      return 'Did not load during discovery. Confirm it is a real page; exclude it if not.';
   }
   return page.requiresAuth ? 'Requires sign-in.' : undefined;
}

type DiscoveredPage = Awaited<ReturnType<typeof discoverSite>>['pages'][number];

function isReachable(page: DiscoveredPage): boolean {
   return (
      typeof page.status === 'number' &&
      page.status >= HTTP_OK_MIN &&
      page.status <= HTTP_OK_MAX
   );
}

/** A page that timed out or dropped the connection, as opposed to answering 404 or 500. */
function isUnloaded(page: DiscoveredPage): boolean {
   return page.status === 'error';
}

function describeSkip(page: DiscoveredPage): string {
   return page.isDuplicateOf === undefined ? `HTTP ${String(page.status)}` : 'duplicate';
}

/**
 * Reads the sitemap and crawls same-origin links, then adds each distinct page to the
 * audit. A page that did not load is still added, with a note, because dropping it would
 * shrink the audit's scope without anyone deciding to; the scan and the workers try it
 * again. Only duplicates and pages that answer with an HTTP error are skipped.
 */
export async function discoverAuditPages(
   audit: Audit,
   options: DiscoverPagesOptions = {},
): Promise<DiscoveredPages> {
   const inventory = await discoverSite(options.url ?? getConfig(audit).target, {
      scope: 'site',
      maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
      include: options.include,
      exclude: options.exclude,
      storageStatePath: options.storageStatePath,
   });
   const known = new Set(listPages(audit).map((page) => page.locator));
   const wanted = inventory.pages.filter(
      (page) =>
         page.isDuplicateOf === undefined &&
         !known.has(page.finalUrl) &&
         (isReachable(page) || isUnloaded(page)),
   );
   if (!options.dryRun) {
      for (const page of wanted) {
         addPage(audit, {
            locator: page.finalUrl,
            name: page.title ?? new URL(page.finalUrl).pathname,
            group: page.templateId,
            notes: describeNotes(page),
         });
      }
   }
   return {
      found: inventory.pages.length,
      added: wanted.map((page) => page.finalUrl),
      unloaded: wanted
         .filter((page) => isUnloaded(page))
         .map((page) => `${page.finalUrl}: ${firstLine(page.error?.message)}`),
      alreadyPresent: inventory.pages.filter((page) => known.has(page.finalUrl)).length,
      skipped: inventory.pages
         .filter((page) => !wanted.includes(page) && !known.has(page.finalUrl))
         .map((page) => `${page.url} (${describeSkip(page)})`),
   };
}
