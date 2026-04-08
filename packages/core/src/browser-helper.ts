import { chromium, type Page } from 'playwright';

export async function withBrowserPage<TResult>(
   url: string,
   callback: (page: Page) => Promise<TResult>,
): Promise<TResult> {
   const browser = await chromium.launch({ headless: true });

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
