import { spawn } from 'node:child_process';
import { basename } from 'node:path';

import type { BrowserAutomationCandidate, DriverFocusTarget } from '@a11ied/contracts';
import type { Browser, Page } from 'playwright';

import { launchAutomationBrowser } from './policy.js';
import { createBrowserAutomationPolicy } from './detection.js';

const SHARED_BROWSER_IDLE_MS = 250;
const BROWSER_OPEN_TIMEOUT_MS = 5000;
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

function resolveBundleId(candidate: BrowserAutomationCandidate): string | undefined {
   const bundleIds: Partial<Record<BrowserAutomationCandidate['id'], string>> = {
      chrome: 'com.google.Chrome',
      msedge: 'com.microsoft.edgemac',
      brave: 'com.brave.Browser',
      chromium: 'org.chromium.Chromium',
   };
   return bundleIds[candidate.id];
}

function deriveFocusTarget(
   candidate: BrowserAutomationCandidate,
): DriverFocusTarget | undefined {
   const bundleId = resolveBundleId(candidate);
   if (candidate.location) {
      const appName = basename(candidate.location);
      if (appName) {
         if (bundleId) {
            return { appName, bundleId };
         }
         return { appName };
      }
   }

   if (candidate.label) {
      if (bundleId) {
         return { appName: candidate.label, bundleId };
      }
      return { appName: candidate.label };
   }

   return undefined;
}

function selectSystemBrowserCandidate(): BrowserAutomationCandidate | undefined {
   const policy = createBrowserAutomationPolicy();
   return policy.candidates.find((candidate) => candidate.source === 'system');
}

function waitForChildExit(
   child: ReturnType<typeof spawn>,
   timeoutMs: number,
): Promise<void> {
   return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
         if (settled) {
            return;
         }
         settled = true;
         reject(new Error(`Browser open command timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      child.once('error', (error) => {
         if (settled) {
            return;
         }
         settled = true;
         clearTimeout(timeout);
         reject(error);
      });

      child.once('exit', (code) => {
         if (settled) {
            return;
         }
         settled = true;
         clearTimeout(timeout);
         if (code === 0) {
            resolve();
            return;
         }
         reject(new Error(`Browser open command exited with code ${String(code)}.`));
      });
   });
}

function escapeAppleScriptString(value: string): string {
   return value.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`);
}

async function openUrlOnMac(
   candidate: BrowserAutomationCandidate,
   url: string,
): Promise<void> {
   const appName = candidate.label || basename(candidate.location ?? '');
   const script = [
      `tell application "${escapeAppleScriptString(appName)}"`,
      'activate',
      'set targetWindow to make new window',
      `set URL of active tab of targetWindow to "${escapeAppleScriptString(url)}"`,
      'end tell',
   ];
   const child = spawn(
      'osascript',
      script.flatMap((line) => ['-e', line]),
      {
         stdio: 'ignore',
      },
   );
   try {
      await waitForChildExit(child, BROWSER_OPEN_TIMEOUT_MS);
   } catch {
      const fallback = spawn('open', ['-a', appName, url], {
         stdio: 'ignore',
      });
      await waitForChildExit(fallback, BROWSER_OPEN_TIMEOUT_MS);
   }
}

async function openUrlOnWindows(url: string): Promise<void> {
   const child = spawn('cmd', ['/c', 'start', '', url], {
      stdio: 'ignore',
      windowsHide: true,
   });
   await waitForChildExit(child, BROWSER_OPEN_TIMEOUT_MS);
}

export async function openUrlInSystemAutomationBrowser(url: string): Promise<{
   candidate: BrowserAutomationCandidate;
   focusTarget: DriverFocusTarget | undefined;
}> {
   const candidate = selectSystemBrowserCandidate();
   if (!candidate) {
      throw new Error(
         'No system browser candidate is available to open a real browser window.',
      );
   }

   if (process.platform === 'darwin') {
      await openUrlOnMac(candidate, url);
   } else if (process.platform === 'win32') {
      await openUrlOnWindows(url);
   } else {
      const child = spawn('xdg-open', [url], {
         stdio: 'ignore',
      });
      await waitForChildExit(child, BROWSER_OPEN_TIMEOUT_MS);
   }

   return {
      candidate,
      focusTarget: deriveFocusTarget(candidate),
   };
}

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

async function ensurePageUrl(page: Page, url: string): Promise<void> {
   if (sharedPageUrl !== url) {
      await page.goto(url, { waitUntil: 'networkidle' });
      sharedPageUrl = url;
   }
}

async function tryReuseSharedPage(url: string): Promise<Page | undefined> {
   if (!sharedPage || sharedPage.isClosed() || sharedPageUsers !== 0) {
      return undefined;
   }
   await ensurePageUrl(sharedPage, url);
   sharedPageUsers += 1;
   return sharedPage;
}

async function createNewPage(browser: Browser, url: string): Promise<Page> {
   const page = await browser.newPage();
   await page.goto(url, { waitUntil: 'networkidle' });
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
): Promise<{
   page: Page;
   reusable: boolean;
}> {
   const reused = await tryReuseSharedPage(url);
   if (reused) {
      return { page: reused, reusable: true };
   }

   const page = await createNewPage(browser, url);
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

export async function withBrowserPage<TResult>(
   url: string,
   callback: (page: Page) => Promise<TResult>,
): Promise<TResult> {
   const browser = await getSharedBrowser();
   sharedBrowserUsers += 1;

   try {
      const { page, reusable } = await getSharedPage(browser, url);
      try {
         return await callback(page);
      } finally {
         await releaseSharedPage(reusable, page);
      }
   } finally {
      releaseSharedBrowser();
   }
}

export async function withLoadedPage<TResult>(
   url: string,
   callback: (page: Page) => Promise<TResult>,
): Promise<TResult> {
   return await withBrowserPage(url, callback);
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
