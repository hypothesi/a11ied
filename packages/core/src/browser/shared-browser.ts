import type { DriverFocusTarget } from '@a11ied/contracts';
import type { Browser, Page } from 'playwright';

import type { DocumentLoad } from '../targets/parse.js';
import { deriveFocusTarget } from './helper.js';
import { loadDocumentIntoPage } from './load.js';
import { applyPageSetup, hasPageSetup, type PageSetupOptions } from './page-setup.js';
import { launchAutomationBrowser } from './policy.js';

const SHARED_BROWSER_IDLE_MS = 250;
const INTERACTIVE_BROWSER_READY_MS = 250;
const BRING_TO_FRONT_SETTLE_MS = 150;

let sharedBrowser: Browser | undefined = globalThis.undefined;
let sharedBrowserPromise: Promise<Browser> | undefined = globalThis.undefined;
let sharedBrowserUsers = 0;
let sharedBrowserCloseTimer: NodeJS.Timeout | undefined = globalThis.undefined;
let sharedPage: Page | undefined = globalThis.undefined;
let sharedPageUrl: string | undefined = globalThis.undefined;
let sharedPageUsers = 0;
let sharedBrowserFocusTarget: DriverFocusTarget | undefined = globalThis.undefined;

async function closeSharedBrowser(): Promise<void> {
   if (!sharedBrowser || sharedBrowserUsers > 0) {
      return;
   }
   const browser = sharedBrowser;
   sharedBrowser = globalThis.undefined;
   sharedPage = globalThis.undefined;
   sharedPageUrl = globalThis.undefined;
   sharedPageUsers = 0;
   sharedBrowserFocusTarget = globalThis.undefined;
   await browser.close();
}

function scheduleBrowserClose(): void {
   if (sharedBrowserCloseTimer) {
      clearTimeout(sharedBrowserCloseTimer);
   }
   sharedBrowserCloseTimer = setTimeout(() => {
      sharedBrowserCloseTimer = globalThis.undefined;
      closeSharedBrowser().catch(() => globalThis.undefined);
   }, SHARED_BROWSER_IDLE_MS);
}

function clearCloseTimer(): void {
   if (sharedBrowserCloseTimer) {
      clearTimeout(sharedBrowserCloseTimer);
      sharedBrowserCloseTimer = globalThis.undefined;
   }
}

async function resolveSharedBrowserPromise(): Promise<Browser> {
   if (sharedBrowser) {
      return sharedBrowser;
   }
   if (!sharedBrowserPromise) {
      sharedBrowserPromise = launchAutomationBrowser().then((result) => {
         sharedBrowser = result.browser;
         sharedBrowserFocusTarget = deriveFocusTarget(result.candidate);
         sharedBrowserPromise = globalThis.undefined;
         return result.browser;
      });
   }
   try {
      return await sharedBrowserPromise;
   } catch (error) {
      sharedBrowserPromise = globalThis.undefined;
      throw error;
   }
}

async function getSharedBrowser(): Promise<Browser> {
   clearCloseTimer();
   if (sharedBrowser) {
      return sharedBrowser;
   }
   return await resolveSharedBrowserPromise();
}

async function ensurePageUrl(page: Page, url: string, timeoutMs?: number): Promise<void> {
   if (sharedPageUrl !== url) {
      await loadDocumentIntoPage(page, { kind: 'goto', url }, { timeoutMs });
      sharedPageUrl = url;
   }
}

async function tryReuseSharedPage(
   url: string,
   timeoutMs?: number,
): Promise<Page | undefined> {
   if (!sharedPage || sharedPage.isClosed() || sharedPageUsers !== 0) {
      return undefined;
   }
   await ensurePageUrl(sharedPage, url, timeoutMs);
   sharedPageUsers += 1;
   return sharedPage;
}

async function createNewPage(
   browser: Browser,
   url: string,
   timeoutMs?: number,
): Promise<Page> {
   const page = await browser.newPage();
   await loadDocumentIntoPage(page, { kind: 'goto', url }, { timeoutMs });
   return page;
}

function claimSharedPage(page: Page, url: string): boolean {
   if (!sharedPage || sharedPage.isClosed()) {
      sharedPage = page;
      sharedPageUrl = url;
      sharedPageUsers = 1;
      return true;
   }
   return false;
}

async function getSharedPage(
   browser: Browser,
   url: string,
   timeoutMs?: number,
): Promise<{
   page: Page;
   reusable: boolean;
}> {
   const reused = await tryReuseSharedPage(url, timeoutMs);
   if (reused) {
      return { page: reused, reusable: true };
   }

   const page = await createNewPage(browser, url, timeoutMs);
   return { page, reusable: claimSharedPage(page, url) };
}

function releaseSharedPage(reusable: boolean, page: Page): Promise<void> {
   if (reusable) {
      sharedPageUsers = Math.max(0, sharedPageUsers - 1);
      return Promise.resolve();
   }
   return page.close();
}

function releaseSharedBrowser(): void {
   sharedBrowserUsers = Math.max(0, sharedBrowserUsers - 1);
   if (sharedBrowserUsers === 0) {
      scheduleBrowserClose();
   }
}

export interface WithBrowserPageOptions extends PageSetupOptions {
   /** Navigation or content-load timeout, in milliseconds. Defaults to Playwright's own. */
   timeoutMs?: number | undefined;
}

/** Runs `callback` against the shared cached page for one URL, reusing it when idle. */
export async function withBrowserPage<TResult>(
   url: string,
   callback: (page: Page) => Promise<TResult>,
   options?: WithBrowserPageOptions,
): Promise<TResult> {
   const browser = await getSharedBrowser();
   sharedBrowserUsers += 1;

   try {
      const { page, reusable } = await getSharedPage(browser, url, options?.timeoutMs);
      try {
         return await callback(page);
      } finally {
         await releaseSharedPage(reusable, page);
      }
   } finally {
      releaseSharedBrowser();
   }
}

/**
 * A fresh, uncached page: used for html loads and any custom viewport, headers, or
 * cookies.
 */
async function withCustomPage<TResult>(
   load: DocumentLoad,
   callback: (page: Page) => Promise<TResult>,
   options: WithBrowserPageOptions,
): Promise<TResult> {
   const browser = await getSharedBrowser();
   sharedBrowserUsers += 1;

   try {
      const page = await browser.newPage();
      try {
         await applyPageSetup(page, options);
         await loadDocumentIntoPage(page, load, options);
         return await callback(page);
      } finally {
         await page.close();
      }
   } finally {
      releaseSharedBrowser();
   }
}

/**
 * Runs `callback` against a loaded page for one resolved document target. A `goto` load
 * with no custom viewport, headers, or cookies reuses the shared cached page when the URL
 * matches. Everything else, including any `html` load (stdin or `--html`), gets a fresh
 * page, since there is no stable cache key or the page must not carry over prior
 * settings.
 */
export async function withLoadedPage<TResult>(
   load: DocumentLoad,
   callback: (page: Page) => Promise<TResult>,
   options: WithBrowserPageOptions = {},
): Promise<TResult> {
   if (load.kind === 'html' || hasPageSetup(options)) {
      return await withCustomPage(load, callback, options);
   }
   return await withBrowserPage(load.url, callback, options);
}

export async function withInteractiveBrowserPage<TResult>(
   url: string,
   callback: (page: Page) => Promise<TResult>,
): Promise<TResult> {
   const launch = await launchAutomationBrowser(undefined, { headless: false });
   sharedBrowserFocusTarget = deriveFocusTarget(launch.candidate);
   const page = await launch.browser.newPage();

   try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.bringToFront();
      await page.waitForTimeout(INTERACTIVE_BROWSER_READY_MS);
      return await callback(page);
   } finally {
      await page.close().catch(() => globalThis.undefined);
      await launch.browser.close().catch(() => globalThis.undefined);
      sharedBrowserFocusTarget = globalThis.undefined;
   }
}

export async function bringBrowserPageToFront(page: Page): Promise<void> {
   await page.bringToFront();
   await page.waitForTimeout(BRING_TO_FRONT_SETTLE_MS);
}

export function getActiveBrowserFocusTarget(): DriverFocusTarget | undefined {
   return sharedBrowserFocusTarget;
}
