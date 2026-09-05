import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import nodeConfig from './vitest.config.js';

/**
 * Runs the `*.browser.test.ts` files inside Chromium, the way a consumer of
 * `a11ied/browser` runs component tests. `npm run test:browser` uses it. The aliases are
 * the node config's; `include` is not merged, or every node test would run here too.
 */
export default defineConfig({
   resolve: nodeConfig.resolve,
   test: {
      include: ['packages/*/src/**/*.browser.test.ts'],
      browser: {
         enabled: true,
         headless: true,
         provider: playwright(),
         instances: [{ browser: 'chromium' }],
      },
   },
});
