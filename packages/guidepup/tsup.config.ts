import { defineConfig } from 'tsup';

export default defineConfig([
   {
      entry: { index: 'src/index.ts', browser: 'src/browser.ts' },
      format: ['esm'],
      dts: true,
   },
   {
      // Self-contained script injected into Playwright pages; see virtual-page.ts.
      entry: { 'virtual-page': 'src/virtual-page.ts' },
      format: ['iife'],
      platform: 'browser',
      noExternal: [/.*/],
      minify: true,
      outExtension: (): { js: string } => ({ js: '.js' }),
   },
]);
