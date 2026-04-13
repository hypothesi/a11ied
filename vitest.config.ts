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
         '@a11ied/contracts': resolve(
            import.meta.dirname,
            'packages/contracts/src/index.ts',
         ),
         '@a11ied/core': resolve(import.meta.dirname, 'packages/core/src/index.ts'),
         '@a11ied/guidepup': resolve(
            import.meta.dirname,
            'packages/guidepup/src/index.ts',
         ),
         '@a11ied/mcp-server': resolve(
            import.meta.dirname,
            'packages/mcp-server/src/index.ts',
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
      server: {
         deps: {
            inline: [/^@a11ied\//, /^#(contracts|core|mcp-server)$/],
         },
      },
   },
});
