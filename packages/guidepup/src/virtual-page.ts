import { virtual } from '@guidepup/virtual-screen-reader';

import { encodeDriverCommandError } from './driver-command-wire.js';
import { createVirtualRuntime, type VirtualRuntime } from './virtual-runtime.js';

/*
 * Built as a self-contained script (dist/virtual-page.js) and added to every page a
 * Playwright-hosted virtual session opens. The Node side then drives the reader through
 * `window.a11iedVirtualRuntime` with page.evaluate. In a page, globalThis is the window.
 */
const runtime = createVirtualRuntime({
   getVirtual: async () => virtual,
   getWindow: () => globalThis,
});

/*
 * Playwright rebuilds an error thrown in a page as a plain Error, which drops the code a
 * DriverCommandError carries. Encoding it into the message keeps the code, and the Node
 * side decodes it back into the error the jsdom engine raises.
 */
function encoded<Args extends unknown[], Result>(
   method: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
   return async (...args: Args): Promise<Result> => {
      try {
         return await method(...args);
      } catch (error) {
         throw encodeDriverCommandError(error);
      }
   };
}

const wrapped: VirtualRuntime = {
   start: encoded(runtime.start),
   stop: encoded(runtime.stop),
   readSpeech: encoded(runtime.readSpeech),
   readCurrentItem: encoded(runtime.readCurrentItem),
   runPortable: encoded(runtime.runPortable),
   navigate: encoded(runtime.navigate),
   press: encoded(runtime.press),
   type: encoded(runtime.type),
   readTitle: encoded(runtime.readTitle),
   findText: encoded(runtime.findText),
   moveInTable: encoded(runtime.moveInTable),
};

globalThis.a11iedVirtualRuntime = wrapped;
