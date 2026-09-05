import {
   decodeDriverCommandError,
   ignoreError,
   readVirtualPageScript,
   type VirtualHost,
} from '@a11ied/guidepup';
import type { Page } from 'playwright';

import { launchAutomationBrowser } from '../browser/policy.js';

type HostMethod = (...args: never[]) => Promise<unknown>;

function decorate(method: HostMethod): HostMethod {
   return async (...args) => {
      try {
         return await method(...args);
      } catch (error) {
         const decoded = decodeDriverCommandError(error);
         throw decoded instanceof Error ? decoded : error;
      }
   };
}

/**
 * Rebuilds the typed error a page threw, so a command the reader cannot run reports the
 * same code and exit status it reports on the jsdom engine.
 */
function withDecodedErrors(host: VirtualHost): VirtualHost {
   const entries = Object.entries(host).map(([name, value]) =>
      typeof value === 'function' ? [name, decorate(value as HostMethod)] : [name, value],
   );
   return Object.fromEntries(entries) as VirtualHost;
}

const PAGE_URL_PATTERN = /^(?:https?|file):/iu;

/** Whether a document URL names a page a browser can open, rather than a placeholder. */
export function isPageUrl(url: string): boolean {
   return PAGE_URL_PATTERN.test(url);
}

async function loadDocument(
   page: Page,
   document: { html: string; url: string },
): Promise<void> {
   if (isPageUrl(document.url)) {
      await page.goto(document.url, { waitUntil: 'load' });
      return;
   }
   await page.setContent(document.html, { waitUntil: 'load' });
}

/**
 * The init script runs on every navigation, but a page that rewrites its own document can
 * drop it, so the runtime is added again by script tag when it is missing.
 */
async function ensureRuntime(page: Page, pageScript: string): Promise<void> {
   const present = await page.evaluate(() => 'a11iedVirtualRuntime' in globalThis);
   if (!present) {
      await page.addScriptTag({ content: pageScript });
   }
}

/**
 * The Playwright host: a headless Chromium page holds the document and the injected
 * script runs the reader inside it, so the page's own scripts, live regions, and focus
 * changes are what the reader sees. Every call crosses into the page with
 * `page.evaluate`, and `dispose` closes the browser.
 */
export async function createPlaywrightVirtualHost(): Promise<VirtualHost> {
   const [pageScript, launch] = await Promise.all([
      readVirtualPageScript(),
      launchAutomationBrowser(),
   ]);
   const page = await launch.browser.newPage();
   await page.addInitScript({ content: pageScript });
   return withDecodedErrors({
      engine: 'browser',
      async attachDocument(document): Promise<void> {
         await loadDocument(page, document);
         await ensureRuntime(page, pageScript);
         await page.evaluate(() => globalThis.a11iedVirtualRuntime.start());
      },
      async dispose(): Promise<void> {
         await page
            .evaluate(() => globalThis.a11iedVirtualRuntime.stop())
            .catch(ignoreError);
         await launch.browser.close();
      },
      start: () => page.evaluate(() => globalThis.a11iedVirtualRuntime.start()),
      stop: () => page.evaluate(() => globalThis.a11iedVirtualRuntime.stop()),
      readSpeech: () => page.evaluate(() => globalThis.a11iedVirtualRuntime.readSpeech()),
      readCurrentItem: () =>
         page.evaluate(() => globalThis.a11iedVirtualRuntime.readCurrentItem()),
      runPortable: (verb) =>
         page.evaluate(
            (wanted) => globalThis.a11iedVirtualRuntime.runPortable(wanted),
            verb,
         ),
      navigate: (request) =>
         page.evaluate((move) => globalThis.a11iedVirtualRuntime.navigate(move), request),
      press: (keys) =>
         page.evaluate(
            (chords) => globalThis.a11iedVirtualRuntime.press(chords),
            [...keys],
         ),
      type: (text) =>
         page.evaluate((typed) => globalThis.a11iedVirtualRuntime.type(typed), text),
      readTitle: () => page.evaluate(() => globalThis.a11iedVirtualRuntime.readTitle()),
      findText: (text) =>
         page.evaluate(
            (wanted) => globalThis.a11iedVirtualRuntime.findText(wanted),
            text,
         ),
      moveInTable: (move) =>
         page.evaluate((step) => globalThis.a11iedVirtualRuntime.moveInTable(step), move),
   });
}
