import { afterAll, afterEach, beforeAll } from 'vitest';

import { cleanupTempRoots, createTestServer, type TestServerHandle } from './fixtures.js';

export function useManagedTestServer(tempRoots: string[]): {
   getBaseUrl(): string;
} {
   let baseUrl = '';
   const repoRoot = process.cwd();
   const testServer: TestServerHandle = createTestServer();

   beforeAll(async () => {
      await testServer.start();
      baseUrl = testServer.getBaseUrl();
   });

   afterAll(async () => {
      await testServer.stop();
   });

   afterEach(async () => {
      process.chdir(repoRoot);
      await cleanupTempRoots(tempRoots);
   });

   return {
      getBaseUrl(): string {
         return baseUrl;
      },
   };
}
