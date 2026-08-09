import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   createTestServer,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   TEST_TIMEOUT_MEDIUM,
} from './setup.js';

const testServer: TestServerHandle = createTestServer();

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

describe('cli verify commands', () => {
   it(
      'verifies a single criterion via CLI with JSON output',
      async () => {
         const baseUrl = testServer.getBaseUrl();
         const result = await runCli([
            'verify',
            'criterion',
            '4.1.3',
            '--target',
            'virtual',
            '--allow-virtual',
            '--url',
            `${baseUrl}/status-message.html`,
            '--json',
         ]);

         expect(result.status).toBe(EXIT_SUCCESS);
         const parsed = parseJsonOutput(result.stdout);
         expect(parsed.ok).toBe(true);
         const resultPayload = parsed.result as Record<string, unknown>;
         const requestedScope = resultPayload.requestedScope as Record<string, unknown>;
         const summary = resultPayload.summary as Record<string, unknown>;
         const verdicts = summary.verdicts as Record<string, unknown>;
         expect(requestedScope.kind).toBe('criterion');
         expect(verdicts.pass).toBe(1);
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      'verifies a single criterion via CLI with text output',
      async () => {
         const baseUrl = testServer.getBaseUrl();
         const result = await runCli([
            'verify',
            'criterion',
            '4.1.3',
            '--target',
            'virtual',
            '--allow-virtual',
            '--url',
            `${baseUrl}/status-message.html`,
         ]);

         expect(result.status).toBe(EXIT_SUCCESS);
         expect(result.stdout).toContain('Verification Report — criterion 4.1.3');
         expect(result.stdout).toContain('Verdict: PASS');
      },
      TEST_TIMEOUT_MEDIUM,
   );
});
