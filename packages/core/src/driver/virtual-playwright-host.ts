import {
   defaultVirtualDocument,
   ignoreError,
   readVirtualPageScript,
   type VirtualHost,
   type VirtualSpeech,
   type VirtualCurrentItem,
} from '@a11ied/guidepup';
import type { JSHandle, Page } from 'playwright';

import { waitForDocumentSettled } from '../browser/load.js';
import { launchAutomationBrowser } from '../browser/policy.js';
import { withCurrentBrowserPage } from '../browser/current-page.js';
import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';

import { ownVirtualPage } from './virtual-page-owner.js';
import { isNavigationError, withDecodedErrors } from './virtual-browser-errors.js';

const PAGE_URL_PATTERN = /^(?:https?|file):/iu;
const BROWSER_ACTIVATION_TIMEOUT_MS = 10_000;

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
      await waitForDocumentSettled(page);
      return;
   }
   await page.setContent(document.html, { waitUntil: 'load' });
   await waitForDocumentSettled(page);
}

/**
 * Borrowed pages retain their CSP and receive no permanent navigation script. Evaluate
 * the trusted bundle when a navigation or document rewrite removed the runtime.
 */
async function ensureRuntime(page: Page, pageScript: string): Promise<boolean> {
   const present = await page.evaluate(() => 'a11iedVirtualRuntime' in globalThis);
   if (!present) {
      await page.evaluate(pageScript);
   }
   return !(await page.evaluate(() => globalThis.a11iedVirtualRuntime.isStarted()));
}

interface NavigationRecoveryContext {
   page: Page;
   pageScript: string;
}

async function recoverNavigation<ResultType>(
   context: NavigationRecoveryContext,
   action: () => Promise<ResultType>,
   replay = false,
): Promise<ResultType> {
   try {
      if (await ensureRuntime(context.page, context.pageScript)) {
         await context.page.evaluate(() => globalThis.a11iedVirtualRuntime.start());
      }
      return await action();
   } catch (error) {
      if (isNavigationError(error)) {
         await context.page.waitForLoadState('load');
         await waitForDocumentSettled(context.page);
         await ensureRuntime(context.page, context.pageScript);
         await context.page.evaluate(() => globalThis.a11iedVirtualRuntime.start());
         if (replay) {
            return action();
         }
         throw new CliEnvironmentError(
            'browser-state-changed',
            'The document changed during this reader action. Reobserve before continuing.',
         );
      }
      throw error;
   }
}

async function readBrowserSnapshot(
   context: NavigationRecoveryContext,
): Promise<{ speech: VirtualSpeech; current: VirtualCurrentItem }> {
   return withCurrentBrowserPage({
      load: { kind: 'goto', url: context.page.url() },
      page: context.page,
      callback: async () =>
         recoverNavigation(
            context,
            () =>
               context.page.evaluate(async () => {
                  const [speech, current] = await Promise.all([
                     globalThis.a11iedVirtualRuntime.readSpeech(),
                     globalThis.a11iedVirtualRuntime.readCurrentItem(),
                  ]);
                  return { speech, current };
               }),
            true,
         ),
   });
}

/** A bound click can finish navigation without replaying input in the next document. */
async function activateBrowserCursor(
   context: NavigationRecoveryContext,
): Promise<{ moved: boolean }> {
   const { page } = context,
      handles: Pick<JSHandle<unknown>, 'dispose'>[] = [];
   try {
      const prepared = await withCurrentBrowserPage({
         load: { kind: 'goto', url: page.url() },
         page,
         async callback() {
            const before = await readBrowserSnapshot(context),
               document = await page.evaluateHandle(() => globalThis.document);
            handles.push(document);
            const node = await page.evaluateHandle(() =>
               globalThis.a11iedVirtualRuntime.readActivationNode(),
            );
            handles.push(node);
            return { before, document, node };
         },
      });
      const element = prepared.node.asElement();
      if (!element) {
         return { moved: false };
      }
      await element.click({ noWaitAfter: false, timeout: BROWSER_ACTIVATION_TIMEOUT_MS });
      const sameDocument = await prepared.document
         .evaluate((document) => document === globalThis.document)
         .catch((error: unknown) => {
            if (isNavigationError(error)) {
               return false;
            }
            throw error;
         });
      if (!sameDocument) {
         await ensureRuntime(page, context.pageScript);
         await page.evaluate(() => globalThis.a11iedVirtualRuntime.start());
      }
      const after = await readBrowserSnapshot(context);
      return {
         moved:
            !sameDocument || prepared.before.current.position !== after.current.position,
      };
   } finally {
      await Promise.all(handles.map((handle) => handle.dispose()));
   }
}

function buildHostNavigationMethods(
   recovery: NavigationRecoveryContext,
): Pick<VirtualHost, 'runPortable' | 'navigate' | 'press' | 'type'> {
   const { page } = recovery;
   return {
      runPortable: (verb) =>
         verb === 'activate'
            ? activateBrowserCursor(recovery)
            : recoverNavigation(recovery, () =>
                 page.evaluate(
                    (wanted) => globalThis.a11iedVirtualRuntime.runPortable(wanted),
                    verb,
                 ),
              ),
      navigate: (request) =>
         recoverNavigation(recovery, () =>
            page.evaluate(
               (move) => globalThis.a11iedVirtualRuntime.navigate(move),
               request,
            ),
         ),
      press: (keys) =>
         recoverNavigation(recovery, () =>
            page.evaluate(
               (chords) => globalThis.a11iedVirtualRuntime.press(chords),
               [...keys],
            ),
         ),
      type: (text) =>
         recoverNavigation(recovery, () =>
            page.evaluate((typed) => globalThis.a11iedVirtualRuntime.type(typed), text),
         ),
   };
}

function buildVirtualHostMethods(
   page: Page,
   pageScript: string,
): Omit<VirtualHost, 'engine' | 'attachDocument' | 'dispose'> {
   const recovery: NavigationRecoveryContext = { page, pageScript };
   return {
      start: () => page.evaluate(() => globalThis.a11iedVirtualRuntime.start()),
      stop: () => page.evaluate(() => globalThis.a11iedVirtualRuntime.stop()),
      readSnapshot: () => readBrowserSnapshot(recovery),
      readSpeech: () =>
         recoverNavigation(
            recovery,
            () => page.evaluate(() => globalThis.a11iedVirtualRuntime.readSpeech()),
            true,
         ),
      readCurrentItem: () =>
         recoverNavigation(
            recovery,
            () => page.evaluate(() => globalThis.a11iedVirtualRuntime.readCurrentItem()),
            true,
         ),
      ...buildHostNavigationMethods(recovery),
      readTitle: () =>
         recoverNavigation(
            recovery,
            () => page.evaluate(() => globalThis.a11iedVirtualRuntime.readTitle()),
            true,
         ),
      findText: (text) =>
         recoverNavigation(recovery, () =>
            page.evaluate(
               (wanted) => globalThis.a11iedVirtualRuntime.findText(wanted),
               text,
            ),
         ),
      moveInTable: (move) =>
         recoverNavigation(recovery, () =>
            page.evaluate(
               (step) => globalThis.a11iedVirtualRuntime.moveInTable(step),
               move,
            ),
         ),
   };
}

async function attachHostDocument(input: {
   page: Page;
   pageScript: string;
   document: { html: string; url: string };
   existing: boolean;
}): Promise<void> {
   const { page, pageScript, document, existing } = input;
   async function start(): Promise<void> {
      await ensureRuntime(page, pageScript);
      await page.evaluate(() => globalThis.a11iedVirtualRuntime.start());
   }
   if (existing) {
      if (document !== defaultVirtualDocument && document.html !== '') {
         throw new CliUsageError(
            'browser-page-setup-conflict',
            'An existing reader page cannot load replacement HTML.',
         );
      }
      await withCurrentBrowserPage({
         load: {
            kind: 'goto',
            url: document === defaultVirtualDocument ? page.url() : document.url,
         },
         page,
         callback: start,
      });
      return;
   }
   await loadDocument(page, document);
   await start();
}

async function createBrowserVirtualHost(existingPage?: Page): Promise<VirtualHost> {
   const launch = existingPage ? undefined : await launchAutomationBrowser();
   try {
      const createdPage = existingPage ?? (await launch?.browser.newPage()),
         pageScript = await readVirtualPageScript();
      if (!createdPage) {
         throw new CliEnvironmentError(
            'browser-unavailable',
            'The virtual reader could not create its browser page.',
         );
      }
      const page = createdPage;
      if (!existingPage) {
         await page.addInitScript({ content: pageScript });
      }
      return withDecodedErrors({
         engine: 'browser',
         attachDocument: (document) =>
            attachHostDocument({
               page,
               pageScript,
               document,
               existing: existingPage !== undefined,
            }),
         async dispose(): Promise<void> {
            if (existingPage) {
               if (!page.isClosed()) {
                  await page.evaluate(() => globalThis.a11iedVirtualRuntime.stop());
               }
               return;
            }
            await page
               .evaluate(() => globalThis.a11iedVirtualRuntime.stop())
               .catch(ignoreError);
            await launch?.browser.close();
         },
         ...buildVirtualHostMethods(page, pageScript),
      });
   } catch (error) {
      await launch?.browser.close();
      throw error;
   }
}

/**
 * A simulated reader runs inside the browser document. Supplying a page retains the
 * caller's browser and state; otherwise disposal closes the browser this host creates.
 */
export async function createPlaywrightVirtualHost(
   existingPage?: Page,
   expectedURL = existingPage?.url(),
): Promise<VirtualHost> {
   if (existingPage && expectedURL !== undefined) {
      return ownVirtualPage({
         page: existingPage,
         url: expectedURL,
         create: () => createBrowserVirtualHost(existingPage),
      });
   }
   return createBrowserVirtualHost();
}
