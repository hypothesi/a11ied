import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
   resolve: {
      alias: {
         '@a11lied/contracts': resolve(__dirname, 'packages/contracts/src/index.ts'),
         '@a11lied/core': resolve(__dirname, 'packages/core/src/index.ts'),
         '@a11lied/guidepup': resolve(__dirname, 'packages/guidepup/src/index.ts'),
         '@a11lied/mcp-server': resolve(__dirname, 'packages/mcp-server/src/index.ts'),
         '@a11lied/storybook': resolve(__dirname, 'packages/storybook/src/index.ts'),
         '@a11lied/wcag-engine': resolve(__dirname, 'packages/wcag-engine/src/index.ts'),
         '@a11lied/wcag-data': resolve(__dirname, 'packages/wcag-data/src/index.ts'),
      },
   },
   test: {
      coverage: {
         provider: 'v8',
         reporter: ['text', 'html'],
         include: ['packages/*/src/**/*.ts'],
      },
      environment: 'node',
      include: ['packages/*/src/**/*.test.ts'],
   },
});
