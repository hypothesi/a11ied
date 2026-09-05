import { virtual } from '@guidepup/virtual-screen-reader';

import { createVirtualRuntime } from './virtual-runtime.js';

/*
 * Built as a self-contained script (dist/virtual-page.js) and added to every page a
 * Playwright-hosted virtual session opens. The Node side then drives the reader through
 * `window.a11iedVirtualRuntime` with page.evaluate. In a page, globalThis is the window.
 */
globalThis.a11iedVirtualRuntime = createVirtualRuntime({
   getVirtual: async () => virtual,
   getWindow: () => globalThis,
});
