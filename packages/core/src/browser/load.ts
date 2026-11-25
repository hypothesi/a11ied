import type { Page, Response } from 'playwright';

import type { DocumentLoad } from '../targets/parse.js';

export interface LoadDocumentOptions {
   /** Navigation or content-load timeout, in milliseconds. Defaults to Playwright's own. */
   timeoutMs?: number | undefined;
}

/**
 * Loads a resolved document target into a Playwright page: navigates for a URL or file
 * target, or sets the page content directly for inline HTML (stdin or `--html`).
 */
function buildLoadOptions(timeoutMs: number | undefined): {
   waitUntil: 'load';
   timeout?: number;
} {
   if (timeoutMs === undefined) {
      return { waitUntil: 'load' };
   }
   return { waitUntil: 'load', timeout: timeoutMs };
}

const SETTLE_TIMEOUT_MS = 3000;

function ignoreError(): void {
   // Ignored intentionally.
}

/**
 * Waits for the animations a page is playing to finish, up to the limit. A page that
 * fades in on load is otherwise scanned or photographed part-way through, where text is
 * still the wrong color. An animation that repeats forever, is paused, or follows
 * scrolling never finishes, so it is not waited for.
 */
async function waitForEntryAnimations(page: Page, limitMs: number): Promise<void> {
   await page.evaluate(async (limit) => {
      const playing = document.getAnimations().filter((animation) => {
         const endTime = animation.effect?.getComputedTiming().endTime;
         return (
            animation.playState === 'running' &&
            animation.timeline instanceof DocumentTimeline &&
            typeof endTime === 'number' &&
            Number.isFinite(endTime)
         );
      });
      await Promise.race([
         Promise.allSettled(playing.map((animation) => animation.finished)),
         new Promise((done) => {
            setTimeout(done, limit);
         }),
      ]);
   }, limitMs);
}

/**
 * Waits for a loaded page to reach the state a person would see. When a page mounts an
 * SPA framework or Storybook asynchronously into an empty root element, waits for child
 * nodes to attach so scans and screen readers do not read an empty shell. Then waits for
 * entry animations to finish.
 */
export async function waitForDocumentSettled(
   page: Page,
   options?: LoadDocumentOptions,
): Promise<void> {
   try {
      const emptyContainerSelector = await page.evaluate(() => {
         const storybookRoot = document.querySelector('#storybook-root');
         if (storybookRoot && storybookRoot.childElementCount === 0) {
            return '#storybook-root';
         }
         const storybookDocs = document.querySelector('#storybook-docs');
         if (storybookDocs && storybookDocs.childElementCount === 0) {
            return '#storybook-docs';
         }
         const root = document.querySelector('#root');
         if (
            root &&
            root.childElementCount === 0 &&
            document.querySelectorAll('script').length > 0
         ) {
            return '#root';
         }
         return '';
      });

      const timeout = Math.min(
         options?.timeoutMs ?? SETTLE_TIMEOUT_MS,
         SETTLE_TIMEOUT_MS,
      );
      if (emptyContainerSelector) {
         await page
            .waitForSelector(`${emptyContainerSelector}:not(:empty)`, {
               state: 'attached',
               timeout,
            })
            .catch(ignoreError);
      }
      await waitForEntryAnimations(page, timeout);
   } catch {
      // Ignored if evaluate fails (e.g. cross-origin framing or navigation error)
   }
}

export async function loadDocumentIntoPage(
   page: Page,
   load: DocumentLoad,
   options?: LoadDocumentOptions,
): Promise<void> {
   const loadOptions = buildLoadOptions(options?.timeoutMs);
   if (load.kind === 'html') {
      await page.setContent(load.html, loadOptions);
      await waitForDocumentSettled(page, options);
      return;
   }

   await page.goto(load.url, loadOptions);
   await waitForDocumentSettled(page, options);
}

/**
 * Navigates to a URL and waits for the page to settle without requiring it. Production
 * pages with analytics, chat widgets, or long polling never reach network idle, and a
 * slow third-party script can hold back the load event, so only the document itself must
 * arrive within the timeout. The later waits are capped and their timeouts ignored.
 */
export async function gotoSettled(
   page: Page,
   url: string,
   options?: LoadDocumentOptions,
): Promise<Response | undefined> {
   const timeout = options?.timeoutMs;
   const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      ...(timeout === undefined ? {} : { timeout }),
   });
   await page
      .waitForLoadState('load', timeout === undefined ? {} : { timeout })
      .catch(ignoreError);
   await page
      .waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS })
      .catch(ignoreError);
   await waitForDocumentSettled(page, options);
   return response ?? undefined;
}
