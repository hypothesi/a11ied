import type * as VirtualScreenReader from '@guidepup/virtual-screen-reader';
import { JSDOM, type DOMWindow } from 'jsdom';

import type { VirtualHost } from './virtual-host.js';
import type { VirtualReader } from './virtual-reader.js';
import { createVirtualRuntime, type VirtualRuntime } from './virtual-runtime.js';
import { ignoreError } from './sequential.js';
import { DriverCommandError } from './driver-command-error.js';

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
// Ponytail: JSDOM shares user-event globals; use separate processes for concurrent hosts.
let activeHost: symbol | undefined = globalThis.undefined;

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

function claimHost(owner: symbol): void {
   if (activeHost !== undefined && activeHost !== owner) {
      throw new DriverCommandError(
         'virtual-session-conflict',
         'Another in-process JSDOM reader owns the document. Stop it or use a separate process or browser engine.',
         { engine: 'jsdom' },
      );
   }
   activeHost = owner;
}

function createOwnedRuntime(owner: symbol, state: { loaded: boolean }): VirtualRuntime {
   return createVirtualRuntime({
      async getVirtual(): Promise<VirtualReader> {
         if (activeHost !== owner) {
            throw new DriverCommandError(
               'virtual-session-not-started',
               'This JSDOM reader has not acquired its document.',
               { engine: 'jsdom' },
            );
         }
         const reader = await loadVirtualReader();
         state.loaded = true;
         return reader;
      },
      getWindow: () => getDom().window,
   });
}

async function cleanupFailedStartup(options: {
   owner: symbol;
   state: { loaded: boolean };
   stop: () => Promise<void>;
   error: unknown;
}): Promise<never> {
   const [cleanup] = await Promise.allSettled([options.stop()]);
   if (cleanup?.status === 'rejected') {
      if (!options.state.loaded && activeHost === options.owner) {
         activeHost = undefined;
      }
      throw new AggregateError(
         [options.error, cleanup.reason],
         'JSDOM startup and cleanup failed.',
         { cause: options.error },
      );
   }
   throw options.error;
}

/**
 * The jsdom host uses the shared user-event document. Lifecycle calls are serialized; a
 * competing host must use another process or wait until this owner stops.
 */
export function createJsdomVirtualHost(): VirtualHost {
   const owner = Symbol('jsdom-host'),
      state = { loaded: false };
   const runtime = createOwnedRuntime(owner, state);
   let tail = Promise.resolve();
   function queueLifecycle(action: () => Promise<void>): Promise<void> {
      const pending = tail.then(action);
      tail = pending.then(ignoreError, ignoreError);
      return pending;
   }
   async function stopHost(): Promise<void> {
      if (activeHost === owner) {
         await runtime.stop();
         if (activeHost === owner) {
            activeHost = undefined;
         }
      }
   }
   async function startHost(document?: { html: string; url: string }): Promise<void> {
      claimHost(owner);
      try {
         if (document) {
            await runtime.stop();
            replaceVirtualDocument(document);
         }
         await runtime.start();
      } catch (error) {
         return cleanupFailedStartup({ owner, state, stop: stopHost, error });
      }
   }
   function stop(): Promise<void> {
      return queueLifecycle(stopHost);
   }
   return {
      ...runtime,
      engine: 'jsdom',
      start: () => queueLifecycle(startHost),
      stop,
      attachDocument: (document) => queueLifecycle(() => startHost(document)),
      dispose: stop,
   };
}
