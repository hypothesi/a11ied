import type { Page } from 'playwright';

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
 * When a page mounts an SPA framework or Storybook asynchronously into an empty root
 * element, wait for child nodes to attach so scans and screen readers do not read an
 * empty shell.
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

      if (emptyContainerSelector) {
         const timeout = Math.min(
            options?.timeoutMs ?? SETTLE_TIMEOUT_MS,
            SETTLE_TIMEOUT_MS,
         );
         await page
            .waitForSelector(`${emptyContainerSelector}:not(:empty)`, {
               state: 'attached',
               timeout,
            })
            .catch(ignoreError);
      }
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
