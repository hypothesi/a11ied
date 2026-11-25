import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
   resolve: {
      alias: {
         '#contracts': resolve(
            import.meta.dirname,
            'packages/cli/src/bridges/contracts.ts',
         ),
         '#core': resolve(import.meta.dirname, 'packages/cli/src/bridges/core.ts'),
         '#mcp-server': resolve(
            import.meta.dirname,
            'packages/cli/src/bridges/mcp-server.ts',
         ),
         '@a11ied/audit': resolve(import.meta.dirname, 'packages/audit/src/index.ts'),
         '@a11ied/compat': resolve(import.meta.dirname, 'packages/compat/src/index.ts'),
         '@a11ied/contracts': resolve(
            import.meta.dirname,
            'packages/contracts/src/index.ts',
         ),
         '@a11ied/core': resolve(import.meta.dirname, 'packages/core/src/index.ts'),
         '@a11ied/earl': resolve(import.meta.dirname, 'packages/earl/src/index.ts'),
         '@a11ied/guidepup/browser': resolve(
            import.meta.dirname,
            'packages/guidepup/src/browser.ts',
         ),
         '@a11ied/guidepup': resolve(
            import.meta.dirname,
            'packages/guidepup/src/index.ts',
         ),
         '@a11ied/knowledge': resolve(
            import.meta.dirname,
            'packages/knowledge/src/index.ts',
         ),
         '@a11ied/mcp-server': resolve(
            import.meta.dirname,
            'packages/mcp-server/src/index.ts',
         ),
         '@a11ied/observe': resolve(import.meta.dirname, 'packages/observe/src/index.ts'),
         '@a11ied/support-data/types': resolve(
            import.meta.dirname,
            'packages/support-data/src/types.ts',
         ),
         '@a11ied/support-data': resolve(
            import.meta.dirname,
            'packages/support-data/src/index.ts',
         ),
         '@a11ied/wcag-engine': resolve(
            import.meta.dirname,
            'packages/wcag-engine/src/index.ts',
         ),
         '@a11ied/wcag-data': resolve(
            import.meta.dirname,
            'packages/wcag-data/src/index.ts',
         ),
      },
   },
   test: {
      coverage: {
         provider: 'v8',
         reportsDirectory: '.test-coverage',
         reporter: ['text', 'html'],
         include: ['packages/*/src/**/*.ts'],
      },
      environment: 'node',
      include: ['packages/*/src/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/*.browser.test.ts'],
      /*
       * Most CLI cases spawn packages/cli/dist/cli.js, and a virtual session there starts
       * headless Chromium, so vitest's 5 second default fails on a loaded machine and on
       * a CI runner slower than a developer laptop. Half the cores keeps those child
       * processes from oversubscribing the machine they run on.
       */
      testTimeout: 30_000,
      hookTimeout: 30_000,
      maxWorkers: '50%',
      server: {
         deps: {
            inline: [/^@a11ied\//, /^#(contracts|core|mcp-server)$/],
         },
      },
   },
});
