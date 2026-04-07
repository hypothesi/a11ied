import { chromium, type Page } from 'playwright';

export async function withBrowserPage<T>(
   url: string,
   callback: (page: Page) => Promise<T>,
): Promise<T> {
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

export async function withLoadedPage<T>(
   url: string,
   callback: (page: Page) => Promise<T>,
): Promise<T> {
   return await withBrowserPage(url, callback);
}
