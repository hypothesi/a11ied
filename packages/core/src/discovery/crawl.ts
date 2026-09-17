import { mkdir, writeFile } from 'node:fs/promises';
import { matchesGlob, relative, resolve } from 'node:path';

import type { PageRecord } from '@a11ied/contracts';
import type { Browser, BrowserContext, Page, Response } from 'playwright';

import { launchAutomationBrowser } from '../browser/policy.js';
import { buildRobotsCheck, DISCOVERY_USER_AGENT } from './robots.js';

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MAX_PAGES = 2000;
const DEFAULT_TIMEOUT_MS = 10_000;
const ARTIFACT_KEY_LENGTH = 32;
const HTTP_FORBIDDEN = 403;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const JSON_INDENT = 2;
const DESTRUCTIVE_PATTERN =
   /\b(checkout|place order|buy now|delete|remove|cancel subscription|close account)\b/iu;

export interface PageVisitResult {
   url: string;
   finalUrl: string;
   canonicalUrl?: string | undefined;
   status: number | 'error';
   title?: string | undefined;
   headingSample?: string | undefined;
   requiresAuth: boolean;
   hasDestructiveActions: boolean;
   links: string[];
   htmlArtifactPath?: string | undefined;
   accessibilityTreeArtifactPath?: string | undefined;
   error?: { code: string; message: string } | undefined;
}

export interface CrawlOptions {
   storageStatePath?: string | undefined;
   artifactsDir?: string | undefined;
   concurrency?: number | undefined;
   maxPages?: number | undefined;
   timeoutMs?: number | undefined;
   seedUrls?: string[] | undefined;
   followLinks?: boolean | undefined;
   include?: string[] | undefined;
   exclude?: string[] | undefined;
   sectionPath?: string | undefined;
   onVisit?: ((visit: PageVisitResult) => Promise<void> | void) | undefined;
}

export interface CrawlResult {
   visits: PageVisitResult[];
   truncated: boolean;
   failures: Array<{ source: string; message: string }>;
}

export function normalizeUrl(value: string): string {
   const url = new URL(value);
   url.hash = '';
   url.hostname = url.hostname.toLowerCase();
   if (
      (url.protocol === 'https:' && url.port === '443') ||
      (url.protocol === 'http:' && url.port === '80')
   ) {
      url.port = '';
   }
   if (url.pathname === '') {
      url.pathname = '/';
   }
   return url.toString();
}

function matchesBoundary(url: string, startUrl: string, options: CrawlOptions): boolean {
   const parsed = new URL(url),
      path = parsed.pathname,
      start = new URL(startUrl);
   if (
      parsed.origin !== start.origin ||
      (options.sectionPath && !path.startsWith(options.sectionPath))
   ) {
      return false;
   }
   if (
      options.include?.length &&
      !options.include.some((pattern) => matchesGlob(path, pattern))
   ) {
      return false;
   }
   return !options.exclude?.some((pattern) => matchesGlob(path, pattern));
}

async function saveArtifacts(
   page: Page,
   artifactsDir: string,
   artifactKey: string,
): Promise<Pick<PageVisitResult, 'htmlArtifactPath' | 'accessibilityTreeArtifactPath'>> {
   const directory = resolve(artifactsDir, artifactKey),
      htmlPath = resolve(directory, 'snapshot.html'),
      treePath = resolve(directory, 'accessibility-tree.json');
   await mkdir(directory, { recursive: true });
   const html = await page.content(),
      snapshot = await page.locator('body').ariaSnapshot();
   await writeFile(htmlPath, html, 'utf8');
   await writeFile(
      treePath,
      `${JSON.stringify({ snapshot }, undefined, JSON_INDENT)}\n`,
      'utf8',
   );
   return {
      htmlArtifactPath: relative(artifactsDir, htmlPath),
      accessibilityTreeArtifactPath: relative(artifactsDir, treePath),
   };
}

async function readPageSignals(input: {
   page: Page;
   requestedUrl: string;
   response?: Response | undefined;
   options: CrawlOptions;
}): Promise<PageVisitResult> {
   const { options, page, requestedUrl, response } = input;
   const finalUrl = normalizeUrl(page.url());
   const canonical = page.locator('link[rel~="canonical"]').first(),
      canonicalCount = await canonical.count(),
      canonicalHref =
         canonicalCount > 0 ? await canonical.getAttribute('href') : undefined,
      canonicalUrl = canonicalHref
         ? normalizeUrl(new URL(canonicalHref, finalUrl).toString())
         : undefined;
   const controls = await page
         .locator('a, button, input[type="submit"]')
         .allTextContents(),
      hasDestructiveActions = controls.some((text) => DESTRUCTIVE_PATTERN.test(text)),
      heading = page.locator('h1, h2, h3, h4, h5, h6').first(),
      headingCount = await heading.count(),
      headingText = headingCount > 0 ? await heading.textContent() : undefined;
   const headingSample = headingText?.trim() || undefined,
      links = await page
         .locator('a[href]')
         .evaluateAll((elements) =>
            elements.map((element) => (element as HTMLAnchorElement).href),
         ),
      passwordFields = await page.locator('input[type="password"]').count();
   const status = response?.status() ?? HTTP_OK,
      titleText = await page.title();
   const requiresAuth =
         status === HTTP_UNAUTHORIZED ||
         status === HTTP_FORBIDDEN ||
         passwordFields > 0 ||
         /\blog[ -]?in\b/iu.test(finalUrl),
      title = titleText.trim() || undefined;
   const artifacts = options.artifactsDir
      ? await saveArtifacts(
           page,
           options.artifactsDir,
           Buffer.from(finalUrl).toString('base64url').slice(0, ARTIFACT_KEY_LENGTH),
        )
      : {};
   return {
      url: requestedUrl,
      finalUrl,
      ...(canonicalUrl ? { canonicalUrl } : {}),
      status,
      ...(title ? { title } : {}),
      ...(headingSample ? { headingSample } : {}),
      requiresAuth,
      hasDestructiveActions,
      links: links.map((link) => normalizeUrl(link)),
      ...artifacts,
   };
}

async function visitPage(
   context: BrowserContext,
   url: string,
   options: CrawlOptions,
): Promise<PageVisitResult> {
   const page = await context.newPage();
   try {
      const response = await page.goto(url, {
         waitUntil: 'networkidle',
         timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      return await readPageSignals({
         page,
         requestedUrl: url,
         response: response ?? undefined,
         options,
      });
   } catch (error) {
      return {
         url,
         finalUrl: url,
         status: 'error',
         requiresAuth: false,
         hasDestructiveActions: false,
         links: [],
         error: {
            code: 'page-visit-failed',
            message: error instanceof Error ? error.message : String(error),
         },
      };
   } finally {
      await page.close();
   }
}

async function readRobots(
   context: BrowserContext,
   startUrl: string,
): Promise<(url: string) => boolean> {
   const robotsUrl = new URL('/robots.txt', startUrl).toString();
   try {
      const response = await context.request.get(robotsUrl, {
         headers: { 'user-agent': DISCOVERY_USER_AGENT },
      });
      return response.ok()
         ? buildRobotsCheck(robotsUrl, await response.text())
         : () => true;
   } catch {
      return () => true;
   }
}

async function createContext(
   browser: Browser,
   options: CrawlOptions,
): Promise<BrowserContext> {
   return browser.newContext({
      userAgent: DISCOVERY_USER_AGENT,
      ...(options.storageStatePath ? { storageState: options.storageStatePath } : {}),
   });
}

interface CrawlState {
   concurrency: number;
   context: BrowserContext;
   failures: CrawlResult['failures'];
   isAllowed: (url: string) => boolean;
   maxPages: number;
   options: CrawlOptions;
   queue: string[];
   queued: Set<string>;
   startUrl: string;
   visited: Set<string>;
   visits: PageVisitResult[];
}

function enqueueLinks(visit: PageVisitResult, state: CrawlState): void {
   if (state.options.followLinks === false) {
      return;
   }
   for (const link of visit.links) {
      const isInScope = matchesBoundary(link, state.startUrl, state.options),
         isNew = !state.queued.has(link) && !state.visited.has(link);
      if (isNew && isInScope && state.isAllowed(link)) {
         state.queued.add(link);
         state.queue.push(link);
      }
   }
}

async function recordVisit(visit: PageVisitResult, state: CrawlState): Promise<void> {
   state.visits.push(visit);
   await state.options.onVisit?.(visit);
   if (visit.error) {
      state.failures.push({ source: visit.url, message: visit.error.message });
   }
   enqueueLinks(visit, state);
}

async function recordVisits(
   visits: PageVisitResult[],
   state: CrawlState,
   index = 0,
): Promise<void> {
   const visit = visits[index];
   if (!visit) {
      return;
   }
   await recordVisit(visit, state);
   await recordVisits(visits, state, index + 1);
}

async function crawlQueue(state: CrawlState): Promise<void> {
   if (state.queue.length === 0 || state.visits.length >= state.maxPages) {
      return;
   }
   const batch = state.queue.splice(
      0,
      Math.min(state.concurrency, state.maxPages - state.visits.length),
   );
   for (const url of batch) {
      state.visited.add(url);
   }
   const results = await Promise.all(
      batch.map((url) => visitPage(state.context, url, state.options)),
   );
   await recordVisits(results, state);
   await crawlQueue(state);
}

/** Visits same-origin pages, follows rendered links, and returns each page's signals. */
export async function crawlSameOrigin(
   startUrl: string,
   options: CrawlOptions = {},
): Promise<CrawlResult> {
   const initialUrls = [
      ...new Set((options.seedUrls ?? [startUrl]).map((url) => normalizeUrl(url))),
   ];
   if (initialUrls.length === 0) {
      return { visits: [], failures: [], truncated: false };
   }
   const launch = await launchAutomationBrowser();
   const context = await createContext(launch.browser, options);
   try {
      const isAllowed = await readRobots(context, startUrl);
      const state: CrawlState = {
         concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
         context,
         failures: [],
         isAllowed,
         maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
         options,
         queue: initialUrls,
         queued: new Set(initialUrls),
         startUrl,
         visited: new Set<string>(),
         visits: [],
      };
      await crawlQueue(state);
      return {
         visits: state.visits,
         failures: state.failures,
         truncated: state.queue.length > 0,
      };
   } finally {
      await context.close();
      await launch.browser.close();
   }
}

export type DiscoveryPageRecord = PageRecord;
