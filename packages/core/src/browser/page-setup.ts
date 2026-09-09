import type { Page } from 'playwright';

import { CliUsageError } from '../errors/cli-errors.js';

/**
 * How long a clicked widget gets to finish opening. A menu that opens on pointerdown
 * attaches its Escape handler a moment after its content mounts, and a key pressed before
 * that is dropped.
 */
const CLICK_SETTLE_MS = 250;

export interface PageCookie {
   name: string;
   value: string;
   url: string;
}

export interface PageSetupOptions {
   viewport?: { width: number; height: number } | undefined;
   extraHeaders?: Record<string, string> | undefined;
   cookies?: PageCookie[] | undefined;
   /**
    * A selector for the one element to click after the page loads, before anything reads
    * it. This is how a command reaches a widget the page renders only after a click, such
    * as a dialog behind its trigger.
    */
   click?: string | undefined;
}

/** True when any option here would require a fresh, uncached page. */
export function hasPageSetup(options: PageSetupOptions): boolean {
   return Boolean(
      options.viewport ??
      options.extraHeaders ??
      options.cookies?.length ??
      options.click,
   );
}

/** Clicks the element `click` names, once the page has loaded. Exactly one must match. */
export async function clickAfterLoad(
   page: Page,
   options: PageSetupOptions,
): Promise<void> {
   if (options.click === undefined) {
      return;
   }
   const locator = page.locator(options.click),
      matches = await locator.count();
   if (matches === 0) {
      throw new CliUsageError(
         'click-target-not-found',
         `No element matches --click "${options.click}".`,
         { click: options.click },
      );
   }
   if (matches > 1) {
      throw new CliUsageError(
         'click-target-not-unique',
         `--click "${options.click}" matches ${String(matches)} elements. Name one.`,
         { click: options.click, matchCount: matches },
      );
   }
   await locator.click();
   await page.waitForTimeout(CLICK_SETTLE_MS);
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
