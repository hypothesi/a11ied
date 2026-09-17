import { request, type APIRequestContext } from 'playwright';
import { JSDOM } from 'jsdom';

const USER_AGENT = 'a11ied-audit-discover/0.1.0';
const DEFAULT_MAX_SITEMAPS = 50;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface SitemapDiscoveryResult {
   urls: string[];
   sitemaps: string[];
   failures: Array<{ source: string; message: string }>;
   truncated: boolean;
}

/** Reads sitemap directives from robots.txt. */
export async function fetchRobotsSitemaps(
   originUrl: string,
   requestContext: APIRequestContext,
): Promise<string[]> {
   const robotsUrl = new URL('/robots.txt', originUrl).toString();
   const response = await requestContext.get(robotsUrl, {
      headers: { 'user-agent': USER_AGENT },
   });
   if (!response.ok()) {
      return [];
   }
   const text = await response.text();
   return text
      .split(/\r?\n/u)
      .map((line) => /^sitemap:\s*(.+)$/iu.exec(line)?.[1]?.trim())
      .filter((value): value is string => value !== undefined);
}

/** Parses either a sitemap URL set or a sitemap index. */
export function parseSitemap(
   xml: string,
   sourceUrl: string,
): { urls: string[]; childSitemaps: string[] } {
   const document = new JSDOM(xml, { contentType: 'text/xml', url: sourceUrl }).window
      .document;
   const readLocations = (selector: string): string[] =>
      [...document.querySelectorAll(selector)]
         .map((element) => element.textContent?.trim())
         .filter((value): value is string => value !== undefined)
         .map((value) => new URL(value, sourceUrl).toString());

   return {
      urls: readLocations('url > loc'),
      childSitemaps: readLocations('sitemap > loc'),
   };
}

export interface DiscoverSitemapOptions {
   maxSitemaps?: number;
   sitemapUrl?: string | undefined;
   storageStatePath?: string | undefined;
   timeoutMs?: number | undefined;
   requestContext?: APIRequestContext | undefined;
}

interface SitemapState {
   failures: SitemapDiscoveryResult['failures'];
   maxSitemaps: number;
   queue: string[];
   requestContext: APIRequestContext;
   seen: Set<string>;
   urls: Set<string>;
}

async function loadSitemap(source: string, state: SitemapState): Promise<void> {
   const response = await state.requestContext.get(source, {
      headers: { 'user-agent': USER_AGENT },
   });
   if (!response.ok()) {
      state.failures.push({ source, message: `HTTP ${String(response.status())}` });
      return;
   }
   const text = await response.text();
   const parsed = parseSitemap(text, source);
   for (const url of parsed.urls) {
      state.urls.add(url);
   }
   state.queue.push(...parsed.childSitemaps);
}

async function readNextSitemap(state: SitemapState): Promise<void> {
   if (state.queue.length === 0 || state.seen.size >= state.maxSitemaps) {
      return;
   }
   const source = state.queue.shift();
   if (!source || state.seen.has(source)) {
      return readNextSitemap(state);
   }
   state.seen.add(source);
   try {
      await loadSitemap(source, state);
   } catch (error) {
      state.failures.push({
         source,
         message: error instanceof Error ? error.message : String(error),
      });
   }
   await readNextSitemap(state);
}

/** Finds URLs from the conventional sitemap, robots.txt, and nested sitemap indexes. */
export async function discoverSitemapUrls(
   startUrl: string,
   options: DiscoverSitemapOptions = {},
): Promise<SitemapDiscoveryResult> {
   const ownContext = options.requestContext === undefined;
   const requestContext =
      options.requestContext ??
      (await request.newContext({
         extraHTTPHeaders: { 'user-agent': USER_AGENT },
         timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
         ...(options.storageStatePath ? { storageState: options.storageStatePath } : {}),
      }));
   const maxSitemaps = options.maxSitemaps ?? DEFAULT_MAX_SITEMAPS,
      origin = new URL(startUrl).origin;
   const conventional = options.sitemapUrl ?? new URL('/sitemap.xml', origin).toString(),
      robotsSitemaps = await fetchRobotsSitemaps(origin, requestContext);
   const state: SitemapState = {
      failures: [],
      maxSitemaps,
      queue: [conventional, ...robotsSitemaps],
      requestContext,
      seen: new Set<string>(),
      urls: new Set<string>(),
   };

   try {
      await readNextSitemap(state);
   } finally {
      if (ownContext) {
         await requestContext.dispose();
      }
   }

   return {
      urls: [...state.urls],
      sitemaps: [...state.seen],
      failures: state.failures,
      truncated: state.queue.length > 0,
   };
}
