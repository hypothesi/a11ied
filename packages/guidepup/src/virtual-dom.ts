import type * as VirtualScreenReader from '@guidepup/virtual-screen-reader';
import { JSDOM, type DOMWindow } from 'jsdom';

import type { VirtualHost } from './virtual-host.js';
import type { VirtualReader } from './virtual-reader.js';
import { createVirtualRuntime } from './virtual-runtime.js';

type VirtualModule = typeof VirtualScreenReader;

/** Not an http(s) URL on purpose: the browser host renders the HTML instead of navigating. */
const PLACEHOLDER_URL = 'about:a11ied-virtual';

/**
 * One JSDOM per process. The virtual reader presses keys through user-event, which
 * captures the global `document` the moment it is imported, so the window has to exist
 * first and has to stay the same object for the life of the process. Attaching a page
 * therefore swaps the document's content and URL instead of creating a new window.
 */
let dom: JSDOM | undefined = globalThis.undefined;
let virtualModule: Promise<VirtualModule> | undefined = globalThis.undefined;

function installDomGlobals(window: DOMWindow): void {
   for (const [name, value] of Object.entries({ window, document: window.document })) {
      Object.defineProperty(globalThis, name, {
         configurable: true,
         writable: true,
         value,
      });
   }
}

function getDom(): JSDOM {
   if (!dom) {
      dom = new JSDOM('<!doctype html><html><body></body></html>', {
         pretendToBeVisual: true,
         url: PLACEHOLDER_URL,
      });
      installDomGlobals(dom.window);
   }
   return dom;
}

/** Returns the virtual reader, importing it only once the DOM globals are in place. */
export async function loadVirtualReader(): Promise<VirtualReader> {
   getDom();
   virtualModule ??= import('@guidepup/virtual-screen-reader');
   const loaded = await virtualModule;
   return loaded.virtual;
}

/** Replaces the document's content and URL in place. */
function replaceVirtualDocument(document: { html: string; url: string }): void {
   const current = getDom();
   const { window } = current;
   current.reconfigure({ url: document.url });
   const parsed = new window.DOMParser().parseFromString(document.html, 'text/html');
   window.document.replaceChild(
      window.document.importNode(parsed.documentElement, true),
      window.document.documentElement,
   );
}

/**
 * The jsdom host: the reader runs in this process against a parsed document. Page scripts
 * do not run, so a live region a script fills or a dialog a click opens never announces
 * here. Used for inline HTML and when no Chromium is available.
 */
export function createJsdomVirtualHost(): VirtualHost {
   const runtime = createVirtualRuntime({
      getVirtual: loadVirtualReader,
      getWindow: () => getDom().window,
   });
   return {
      ...runtime,
      engine: 'jsdom',
      async attachDocument(document): Promise<void> {
         await runtime.stop();
         replaceVirtualDocument(document);
         await runtime.start();
      },
      dispose: runtime.stop,
   };
}
