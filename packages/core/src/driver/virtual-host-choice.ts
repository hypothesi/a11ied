import type { VirtualEngine } from '@a11ied/contracts';
import { createJsdomVirtualHost, type VirtualHost } from '@a11ied/guidepup';

import { CliEnvironmentError } from '../errors/cli-errors.js';
import { createPlaywrightVirtualHost, isPageUrl } from './virtual-playwright-host.js';

export interface VirtualHostChoice {
   /** Forces one engine. The session fails when that engine cannot start. */
   engine?: VirtualEngine | undefined;
   /** The page the session opens, when it opens one. */
   url?: string | undefined;
}

function isBrowserUnavailable(error: unknown): boolean {
   return error instanceof CliEnvironmentError && error.code === 'browser-unavailable';
}

/**
 * Picks where a virtual session runs. An explicit engine wins. Otherwise an http(s) or
 * file URL gets the browser when Chromium launches, and everything else gets jsdom:
 * inline HTML, no URL, and a host where no Chromium-family browser is installed.
 */
export async function createVirtualHost(choice: VirtualHostChoice): Promise<VirtualHost> {
   if (choice.engine === 'jsdom') {
      return createJsdomVirtualHost();
   }
   if (choice.engine === 'browser') {
      return createPlaywrightVirtualHost();
   }
   if (choice.url === undefined || !isPageUrl(choice.url)) {
      return createJsdomVirtualHost();
   }
   try {
      return await createPlaywrightVirtualHost();
   } catch (error) {
      if (isBrowserUnavailable(error)) {
         return createJsdomVirtualHost();
      }
      throw error;
   }
}
