import type { Page } from 'playwright';

import { launchAutomationBrowser } from './policy.js';

export async function withBrowserPage<TResult>(
   url: string,
   callback: (page: Page) => Promise<TResult>,
): Promise<TResult> {
   const { browser } = await launchAutomationBrowser();

   try {
      const page = await browser.newPage();
      await page.goto(url, {
         waitUntil: 'networkidle',
      });
      return await callback(page);
   } finally {
      await browser.close();
   }
}

export async function withLoadedPage<TResult>(
   url: string,
   callback: (page: Page) => Promise<TResult>,
): Promise<TResult> {
   return await withBrowserPage(url, callback);
}
