import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   createTestServer,
   cleanupTempRoots,
   withTempDir,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   TEST_TIMEOUT_LONG,
} from './command-handlers-setup.js';

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

async function assertLandmarkPattern(baseUrl: string): Promise<void> {
   const result = await runCli([
      'run',
      'pattern',
      'landmark_sequence',
      '--url',
      `${baseUrl}/basic-page.html`,
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { stepLog: unknown[] }).stepLog.length).toBeGreaterThan(0);
   expect(
      (json.result as { spokenPhraseLog: unknown[] }).spokenPhraseLog.length,
   ).toBeGreaterThan(0);
   expect((json.result as { itemTextLog: unknown[] }).itemTextLog.length).toBeGreaterThan(
      0,
   );
}

async function assertHeadingPattern(baseUrl: string): Promise<void> {
   const result = await runCli([
      'run',
      'pattern',
      'heading_sequence',
      '--url',
      `${baseUrl}/basic-page.html`,
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect(
      (json.result as { targetMetadata: { headings: Array<{ text: string }> } })
         .targetMetadata.headings[0]?.text ?? '',
   ).toBe('Basic content page');
   expect(
      (
         json.result as { assertions: Array<{ id: string; status: string }> }
      ).assertions.some(
         (entry) => entry.id === 'heading-order' && entry.status === 'passed',
      ),
   ).toBe(true);
}

async function assertStatusMessagePattern(baseUrl: string): Promise<void> {
   const result = await runCli([
      'run',
      'pattern',
      'status_message_probe',
      '--url',
      `${baseUrl}/status-message.html`,
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect(
      (json.result as { stepLog: Array<{ id: string }> }).stepLog.some(
         (entry) => entry.id === 'trigger-status-message',
      ),
   ).toBe(true);
   expect((json.result as { spokenPhraseLog: string[] }).spokenPhraseLog).toContain(
      'Profile saved successfully.',
   );
   expect(
      (json.result as { targetMetadata: { focusChangedUnexpectedly: boolean } })
         .targetMetadata.focusChangedUnexpectedly,
   ).toBe(false);
}

async function assertDialogPattern(baseUrl: string): Promise<void> {
   const result = await runCli([
      'run',
      'pattern',
      'dialog_probe',
      '--url',
      `${baseUrl}/dialog.html`,
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const assertions = (
      json.result as { assertions: Array<{ id: string; status: string }> }
   ).assertions;
   expect(assertions.find((entry) => entry.id === 'focus-entry')?.status).toBe('passed');
   expect(assertions.find((entry) => entry.id === 'focus-containment')?.status).toBe(
      'passed',
   );
   expect(assertions.find((entry) => entry.id === 'close-behavior')?.status).toBe(
      'passed',
   );
}

describe('cli run pattern commands / core patterns', () => {
   it(
      'runs landmark pattern',
      () =>
         withTempDir(tempRoots, async () => {
            await assertLandmarkPattern(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_LONG,
   );

   it(
      'runs heading pattern',
      () =>
         withTempDir(tempRoots, async () => {
            await assertHeadingPattern(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_LONG,
   );

   it(
      'runs status message pattern',
      () =>
         withTempDir(tempRoots, async () => {
            await assertStatusMessagePattern(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_LONG,
   );

   it(
      'runs dialog pattern',
      () =>
         withTempDir(tempRoots, async () => {
            await assertDialogPattern(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_LONG,
   );
});
