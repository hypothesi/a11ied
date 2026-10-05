import type { Frame, Page } from 'playwright';
import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';
import type { DocumentLoad } from '../targets/parse.js';
import type { WithBrowserPageOptions } from './shared-browser.js';
import { hasPageSetup } from './page-setup.js';

const inlineDocuments = new WeakMap<Page, string>();

/** Retain the source identity of an inline document loaded by the browser helper. */
export function registerInlineDocument(page: Page, load: DocumentLoad): void {
   function clearSource(frame: Frame): void {
      if (frame === page.mainFrame()) {
         inlineDocuments.delete(page);
         page.off('framenavigated', clearSource);
      }
   }
   if (load.kind === 'html') {
      inlineDocuments.set(page, load.html);
      page.on('framenavigated', clearSource);
   }
}

function assertCurrentPage(
   load: DocumentLoad,
   page: Page,
   options: WithBrowserPageOptions,
): void {
   if (page.isClosed()) {
      throw new CliEnvironmentError(
         'browser-page-closed',
         'The assessment page has closed. Reobserve the target before continuing.',
      );
   }
   if (hasPageSetup({ ...options, waitFor: undefined })) {
      throw new CliUsageError(
         'browser-page-setup-conflict',
         'An existing assessment page cannot apply new storage, cookies, headers, viewport, or click setup.',
      );
   }
   if (load.kind === 'goto' && new URL(load.url).href !== new URL(page.url()).href) {
      throw new CliUsageError(
         'browser-page-target-mismatch',
         'The supplied page does not show the requested URL. Reobserve its current target.',
      );
   }
   if (load.kind === 'html' && inlineDocuments.get(page) !== load.html) {
      throw new CliUsageError(
         'browser-page-target-mismatch',
         'This page was not loaded from the supplied inline document.',
      );
   }
}

/** Read an existing document without navigating or changing its authentication or UI. */
export async function withCurrentBrowserPage<TResult>(input: {
   load: DocumentLoad;
   page: Page;
   callback: (page: Page) => Promise<TResult>;
   setup?: WithBrowserPageOptions | undefined;
}): Promise<TResult> {
   const { load, page, callback, setup: options = {} } = input;
   assertCurrentPage(load, page, options);
   let navigated = false;
   function recordNavigation(frame: Frame): void {
      if (frame === page.mainFrame()) {
         navigated = true;
         inlineDocuments.delete(page);
      }
   }
   page.on('framenavigated', recordNavigation);
   try {
      if (options.waitFor) {
         await page.waitForSelector(
            options.waitFor,
            options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs },
         );
      }
      const result = await callback(page);
      if (navigated || page.isClosed()) {
         throw new CliEnvironmentError(
            'browser-state-changed',
            'The assessment document changed during observation. Reobserve it before using these results.',
         );
      }
      return result;
   } finally {
      page.off('framenavigated', recordNavigation);
   }
}
