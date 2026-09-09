import { defineConfig } from 'vitest/config';

/*
 * The suites under examples/ run against live sites through the built `a11ied` package,
 * so they need the network and `npm run build` first. They are kept out of `npm test`,
 * which runs offline against fixtures.
 */
export default defineConfig({
   test: {
      environment: 'node',
      include: ['examples/**/*.test.ts'],
      testTimeout: 120_000,
      hookTimeout: 60_000,
   },
});
