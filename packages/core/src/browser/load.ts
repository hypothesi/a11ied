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
   waitUntil: 'networkidle';
   timeout?: number;
} {
   if (timeoutMs === undefined) {
      return { waitUntil: 'networkidle' };
   }
   return { waitUntil: 'networkidle', timeout: timeoutMs };
}

export async function loadDocumentIntoPage(
   page: Page,
   load: DocumentLoad,
   options?: LoadDocumentOptions,
): Promise<void> {
   const loadOptions = buildLoadOptions(options?.timeoutMs);
   if (load.kind === 'html') {
      await page.setContent(load.html, loadOptions);
      return;
   }

   await page.goto(load.url, loadOptions);
}
