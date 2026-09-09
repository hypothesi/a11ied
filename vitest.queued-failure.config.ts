import { defineConfig } from 'vitest/config';

import nodeConfig from './vitest.config.js';

/**
 * Runs the tests under `packages/cli/test/fixtures/` that fail on purpose.
 * `packages/cli/src/vitest/queued.test.ts` spawns Vitest with this config and reads the
 * JSON report. The aliases are the node config's; `include` is not merged, because the
 * root run must keep ignoring these files.
 */
export default defineConfig({
   resolve: nodeConfig.resolve,
   test: {
      include: ['packages/cli/test/fixtures/*.test.ts'],
      server: nodeConfig.test?.server,
      testTimeout: nodeConfig.test?.testTimeout,
   },
});
