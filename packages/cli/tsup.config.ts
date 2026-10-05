import { defineConfig } from 'tsup';
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Left to the installed packages: native drivers, browsers, and everything they load. */
const nodeExternals = [
   '@guidepup/guidepup',
   '@guidepup/setup',
   '@guidepup/virtual-screen-reader',
   '@guidepup/record',
   'playwright',
   'playwright-core',
   'chromium-bidi',
   'chromium-bidi/lib/cjs/bidiMapper/BidiMapper',
   'chromium-bidi/lib/cjs/cdp/CdpConnection',
   'jsdom',
   'axe-core',
   'proper-lockfile',
   'pngjs',
   '@modelcontextprotocol/sdk',
   'vitest',
];

export default defineConfig([
   {
      entry: {
         index: 'src/index.ts',
         cli: 'src/cli.ts',
         test: 'src/test/index.ts',
         vitest: 'src/vitest/index.ts',
      },
      format: ['esm'],
      dts: true,
      external: nodeExternals,
      onSuccess: async (): Promise<void> => {
         await cp(
            resolve(import.meta.dirname, '../skills'),
            resolve(import.meta.dirname, 'dist/skills'),
            { recursive: true },
         );
      },
   },
   {
      // Runs inside Vitest browser mode, so it carries everything but vitest itself.
      entry: { browser: 'src/browser/index.ts' },
      format: ['esm'],
      platform: 'browser',
      dts: true,
      external: ['vitest'],
      noExternal: [/^(?!vitest$).*/u],
   },
]);
