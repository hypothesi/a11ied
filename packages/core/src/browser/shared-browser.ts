import type { DriverFocusTarget } from '@a11ied/contracts';
import type { Browser, Page } from 'playwright';

import type { DocumentLoad } from '../targets/parse.js';
import { deriveFocusTarget } from './helper.js';
import { loadDocumentIntoPage } from './load.js';
import {
   applyPageSetup,
   clickAfterLoad,
   hasPageSetup,
   type PageSetupOptions,
} from './page-setup.js';
import { launchAutomationBrowser } from './policy.js';
import { registerInlineDocument, withCurrentBrowserPage } from './current-page.js';

const SHARED_BROWSER_IDLE_MS = 250;
const INTERACTIVE_BROWSER_READY_MS = 250;
const BRING_TO_FRONT_SETTLE_MS = 150;

let sharedBrowser: Browser | undefined = globalThis.undefined;
let sharedBrowserPromise: Promise<Browser> | undefined = globalThis.undefined;
let sharedBrowserUsers = 0;
let sharedBrowserCloseTimer: NodeJS.Timeout | undefined = globalThis.undefined;
let sharedBrowserFocusTarget: DriverFocusTarget | undefined = globalThis.undefined;
let sharedCleanUserAgent: string | undefined = globalThis.undefined;

export function sanitizeHeadlessUserAgent(userAgent: string): string {
   return userAgent.replace('HeadlessChrome/', 'Chrome/');
}

async function resolveCleanUserAgent(browser: Browser): Promise<string> {
   if (sharedCleanUserAgent !== undefined) {
      return sharedCleanUserAgent;
   }
   const page = await browser.newPage();
   try {
      const rawUserAgent = await page.evaluate(() => navigator.userAgent);
      sharedCleanUserAgent = sanitizeHeadlessUserAgent(rawUserAgent);
      return sharedCleanUserAgent;
   } finally {
      await page.close().catch(() => globalThis.undefined);
   }
}

async function closeSharedBrowser(): Promise<void> {
   if (!sharedBrowser || sharedBrowserUsers > 0) {
      return;
   }
   const browser = sharedBrowser;
   sharedBrowser = globalThis.undefined;
   sharedCleanUserAgent = globalThis.undefined;
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

async function createNewPage(browser: Browser): Promise<Page> {
   const userAgent = await resolveCleanUserAgent(browser);
   return browser.newPage({ userAgent });
}

function releaseSharedBrowser(): void {
   sharedBrowserUsers = Math.max(0, sharedBrowserUsers - 1);
   if (sharedBrowserUsers === 0) {
      scheduleBrowserClose();
   }
}

export interface WithBrowserPageOptions extends PageSetupOptions {
   /** Read this existing page without navigating, applying setup, or closing it. */
   page?: Page | undefined;
   /** Navigation or content-load timeout, in milliseconds. Defaults to Playwright's own. */
   timeoutMs?: number | undefined;
}

/** Independent calls load fresh pages; explicit page callers retain their observed state. */
export async function withBrowserPage<TResult>(
   url: string,
   callback: (page: Page) => Promise<TResult>,
   options?: WithBrowserPageOptions,
): Promise<TResult> {
   if (options?.page) {
      return withCurrentBrowserPage({
         load: { kind: 'goto', url },
         page: options.page,
         callback,
         setup: options,
      });
   }
   const browser = await getSharedBrowser();
   sharedBrowserUsers += 1;

   try {
      const page = await createNewPage(browser);
      try {
         await loadDocumentIntoPage(
            page,
            { kind: 'goto', url },
            { timeoutMs: options?.timeoutMs },
         );
         return await callback(page);
      } finally {
         await page.close();
      }
   } finally {
      releaseSharedBrowser();
   }
}

async function withPreparedBrowserPage<TResult>(input: {
   browser: Browser;
   load: DocumentLoad;
   callback: (page: Page) => Promise<TResult>;
   options: WithBrowserPageOptions & { userAgent?: string | undefined };
}): Promise<TResult> {
   const { browser, load, callback, options } = input;
   const userAgent = options.userAgent;
   const context = await browser.newContext({
      ...(options.storageStatePath ? { storageState: options.storageStatePath } : {}),
      ...(userAgent === undefined ? {} : { userAgent }),
   });
   try {
      const page = await context.newPage();
      await applyPageSetup(page, options);
      await loadDocumentIntoPage(page, load, options);
      registerInlineDocument(page, load);
      await clickAfterLoad(page, options);
      return await callback(page);
   } finally {
      await context.close();
   }
}

/** Custom setup gets an isolated context; observations can retain its page explicitly. */
async function withCustomPage<TResult>(
   load: DocumentLoad,
   callback: (page: Page) => Promise<TResult>,
   options: WithBrowserPageOptions,
): Promise<TResult> {
   const browser = await getSharedBrowser();
   sharedBrowserUsers += 1;
   try {
      const userAgent =
         options.extraHeaders?.['user-agent'] ?? (await resolveCleanUserAgent(browser));
      return await withPreparedBrowserPage({
         browser,
         load,
         callback,
         options: { ...options, userAgent },
      });
   } finally {
      releaseSharedBrowser();
   }
}

/**
 * A supplied page preserves its current document. Independent calls load fresh pages and
 * contexts so prior interaction, authentication, and setup cannot leak into them.
 */
export async function withLoadedPage<TResult>(
   load: DocumentLoad,
   callback: (page: Page) => Promise<TResult>,
   options: WithBrowserPageOptions = {},
): Promise<TResult> {
   if (options.page) {
      return withCurrentBrowserPage({
         load,
         page: options.page,
         callback,
         setup: options,
      });
   }
   if (load.kind === 'html' || hasPageSetup(options)) {
      return await withCustomPage(load, callback, options);
   }
   return await withBrowserPage(load.url, callback, options);
}

/**
 * A supplied page returns its current rendered content without navigation. Independent
 * calls load a fresh document instead of returning content cached by URL.
 */
export async function getPageHtml(
   load: DocumentLoad,
   options: WithBrowserPageOptions = {},
): Promise<string> {
   return withLoadedPage(load, (page) => page.content(), options);
}

export async function bringBrowserPageToFront(page: Page): Promise<void> {
   await page.bringToFront();
   await page.waitForTimeout(BRING_TO_FRONT_SETTLE_MS);
}

/** Keep a headed, authenticated page open for the callback, including manual sign-in. */
export async function withInteractiveBrowserPage<TResult>(
   url: string,
   callback: (page: Page) => Promise<TResult>,
   options: WithBrowserPageOptions = {},
): Promise<TResult> {
   if (options.page) {
      return withCurrentBrowserPage({
         load: { kind: 'goto', url },
         page: options.page,
         callback: async (page) => {
            await bringBrowserPageToFront(page);
            return callback(page);
         },
         setup: options,
      });
   }
   const launch = await launchAutomationBrowser(undefined, { headless: false });
   sharedBrowserFocusTarget = deriveFocusTarget(launch.candidate);
   try {
      return await withPreparedBrowserPage({
         browser: launch.browser,
         load: { kind: 'goto', url },
         options,
         callback: async (page) => {
            await page.bringToFront();
            await page.waitForTimeout(INTERACTIVE_BROWSER_READY_MS);
            return callback(page);
         },
      });
   } finally {
      await launch.browser.close();
      sharedBrowserFocusTarget = globalThis.undefined;
   }
}

export function getActiveBrowserFocusTarget(): DriverFocusTarget | undefined {
   return sharedBrowserFocusTarget;
}
