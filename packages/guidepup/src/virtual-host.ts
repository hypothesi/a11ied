import type { VirtualEngine } from '@a11ied/contracts';

import type { VirtualRuntime } from './virtual-runtime.js';

/**
 * A runtime plus the document it runs against. The jsdom host swaps the document in
 * place. The Playwright host navigates a page and re-injects the runtime.
 */
export interface VirtualHost extends VirtualRuntime {
   readonly engine: VirtualEngine;
   /**
    * Loads a document and starts the reader on it. The Playwright host navigates to `url`
    * when it is an http(s) or file URL and renders `html` otherwise. The jsdom host
    * always renders `html` and records `url` as the document location.
    */
   attachDocument(document: { html: string; url: string }): Promise<void>;
   /** Stops the reader and releases what holds the document: the browser, for Playwright. */
   dispose(): Promise<void>;
}
