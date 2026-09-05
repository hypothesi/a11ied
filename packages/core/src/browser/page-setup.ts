import type { Page } from 'playwright';

export interface PageCookie {
   name: string;
   value: string;
   url: string;
}

export interface PageSetupOptions {
   viewport?: { width: number; height: number } | undefined;
   extraHeaders?: Record<string, string> | undefined;
   cookies?: PageCookie[] | undefined;
}

/** True when any option here would require a fresh, uncached page. */
export function hasPageSetup(options: PageSetupOptions): boolean {
   return Boolean(options.viewport ?? options.extraHeaders ?? options.cookies?.length);
}

/** Applies viewport, extra headers, and cookies to a page before it navigates. */
export async function applyPageSetup(
   page: Page,
   options: PageSetupOptions,
): Promise<void> {
   if (options.viewport) {
      await page.setViewportSize(options.viewport);
   }
   if (options.extraHeaders) {
      await page.setExtraHTTPHeaders(options.extraHeaders);
   }
   if (options.cookies && options.cookies.length > 0) {
      await page.context().addCookies(options.cookies);
   }
}
