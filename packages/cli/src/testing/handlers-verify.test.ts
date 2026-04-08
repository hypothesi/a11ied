import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   createTestServer,
   cleanupTempRoots,
   withTempDir,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   EXIT_USAGE,
   EXIT_ASSERTION,
   TEST_TIMEOUT_VERY_LONG,
} from './setup.js';

const testServer: TestServerHandle = createTestServer();
const tempRoots: string[] = [];

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

afterEach(async () => {
   await cleanupTempRoots(tempRoots);
});

async function assertVerifyAutomated(baseUrl: string): Promise<void> {
   const result = await runCli([
      'verify',
      'criterion',
      '4.1.2',
      '--url',
      `${baseUrl}/button-name-failure.html`,
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ASSERTION);
   expect((json.result as { requestedScope: { kind: string } }).requestedScope.kind).toBe(
      'criterion',
   );
   expect((json.result as { wcagVersion: string }).wcagVersion).toBe('2.2');
   const first = (
      json.result as {
         criteria: Array<{
            criterionId: string;
            verdict: string;
            evidenceMode: string;
            evidence: unknown[];
            sourceReferences: unknown[];
         }>;
      }
   ).criteria[0];
   expect(first).toMatchObject({
      criterionId: '4.1.2',
      verdict: 'fail',
      evidenceMode: 'automated',
   });
   expect(first?.evidence.length).toBeGreaterThan(0);
   expect(first?.sourceReferences.length).toBeGreaterThan(0);
}

async function assertVerifyHybrid(baseUrl: string): Promise<void> {
   const result = await runCli([
      'verify',
      'criterion',
      '4.1.3',
      '--url',
      `${baseUrl}/status-message.html`,
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const first = (
      json.result as {
         criteria: Array<{
            criterionId: string;
            verdict: string;
            evidenceMode: string;
            procedureIds: string[];
            evidence: Array<{ patternResult?: { spokenPhraseLog: string[] } }>;
         }>;
      }
   ).criteria[0];
   expect(first).toMatchObject({
      criterionId: '4.1.3',
      verdict: 'pass',
      evidenceMode: 'hybrid',
      procedureIds: ['status_message_probe'],
   });
   expect(
      first?.evidence.some((entry) =>
         entry.patternResult?.spokenPhraseLog.includes('Profile saved successfully.'),
      ),
   ).toBe(true);
}

async function assertVerifyManual(baseUrl: string): Promise<void> {
   const result = await runCli([
      'verify',
      'criterion',
      '3.3.8',
      '--url',
      `${baseUrl}/auth-login.html`,
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ASSERTION);
   const first = (
      json.result as {
         criteria: Array<{
            criterionId: string;
            verdict: string;
            uncoveredWork: Array<{ message: string }>;
            evidence: unknown[];
         }>;
      }
   ).criteria[0];
   expect(first).toMatchObject({ criterionId: '3.3.8', verdict: 'needs-manual-review' });
   expect(first?.evidence.length).toBeGreaterThan(0);
   expect(first?.uncoveredWork.length).toBeGreaterThan(0);
}

async function assertVerifyInvalid(baseUrl: string): Promise<void> {
   const result = await runCli([
      'verify',
      'criterion',
      '9.9.9',
      '--url',
      `${baseUrl}/basic-page.html`,
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_USAGE);
   expect(
      (json.errors as Array<{ details?: { lookupKey?: string } }>)[0]?.details?.lookupKey,
   ).toBe('9.9.9');
}

describe('cli verify criterion commands / single criterion', () => {
   it(
      'verifies automated criterion',
      () =>
         withTempDir(tempRoots, async () => {
            await assertVerifyAutomated(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'verifies hybrid criterion',
      () =>
         withTempDir(tempRoots, async () => {
            await assertVerifyHybrid(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'verifies manual review criterion',
      () =>
         withTempDir(tempRoots, async () => {
            await assertVerifyManual(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'rejects invalid criterion id',
      () =>
         withTempDir(tempRoots, async () => {
            await assertVerifyInvalid(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );
});
