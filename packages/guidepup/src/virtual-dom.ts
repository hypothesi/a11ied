import { JSDOM, type DOMWindow } from 'jsdom';

type VirtualModule = typeof import('@guidepup/virtual-screen-reader');
export type VirtualReader = VirtualModule['virtual'];

const PLACEHOLDER_URL = 'https://a11ied.local/virtual';

/**
 * One JSDOM per process. The virtual reader presses keys through user-event, which
 * captures the global `document` the moment it is imported, so the window has to exist
 * first and has to stay the same object for the life of the process. Attaching a page
 * therefore swaps the document's content and URL instead of creating a new window.
 */
let dom: JSDOM | undefined = undefined;
let virtualModule: Promise<VirtualModule> | undefined = undefined;

function installDomGlobals(window: DOMWindow): void {
   for (const [name, value] of Object.entries({ window, document: window.document })) {
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
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
   return (await virtualModule).virtual;
}

/** Replaces the document's content and URL in place and returns the shared window. */
export function replaceVirtualDocument(document: { html: string; url: string }): DOMWindow {
   const current = getDom();
   const { window } = current;
   current.reconfigure({ url: document.url });
   const parsed = new window.DOMParser().parseFromString(document.html, 'text/html');
   window.document.replaceChild(
      window.document.importNode(parsed.documentElement, true),
      window.document.documentElement,
   );
   return window;
}
