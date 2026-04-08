import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   createTestServer,
   cleanupTempRoots,
   withTempDir,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   EXIT_ASSERTION,
   TEST_TIMEOUT_LONG,
   TEST_TIMEOUT_MEDIUM,
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

async function assertFocusVisibilityPattern(baseUrl: string): Promise<void> {
   const result = await runCli([
      'run',
      'pattern',
      'focus_visibility_probe',
      '--url',
      `${baseUrl}/focus-obscured.html`,
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const assertions = (
      json.result as { assertions: Array<{ id: string; status: string }> }
   ).assertions;
   expect(assertions.length).toBeGreaterThan(0);
   expect(
      assertions.find((entry) => entry.id === 'focus-geometry-collected')?.status,
   ).toBe('passed');
   expect(
      (json.result as { targetMetadata: { overlapPixels: number } }).targetMetadata
         .overlapPixels,
   ).toBeGreaterThan(0);
   expect(
      (json.result as { browserEvidence: unknown[] }).browserEvidence.length,
   ).toBeGreaterThan(0);
}

async function assertFocusObscuredFailure(baseUrl: string): Promise<void> {
   const result = await runCli([
      'run',
      'pattern',
      'focus_obscured_probe',
      '--url',
      `${baseUrl}/focus-obscured.html`,
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ASSERTION);
   expect(json.ok).toBe(false);
   const assertions = (
      json.result as { assertions: Array<{ id: string; status: string }> }
   ).assertions;
   expect(assertions.find((entry) => entry.id === 'focus-obscured')?.status).toBe(
      'failed',
   );
   expect(
      (json.result as { targetMetadata: { overlapPixels: number } }).targetMetadata
         .overlapPixels,
   ).toBeGreaterThan(0);
   expect((json.errors as Array<{ code: string }>)[0]?.code).toBe(
      'pattern-assertion-failed',
   );
}

async function assertSessionReuse(baseUrl: string): Promise<void> {
   const started = await runCli(['drive', 'start', '--target', 'virtual', '--json']);
   const startedJson = parseJsonOutput(started.stdout);
   const session = (startedJson.result as { session: { sessionId: string } }).session;
   const reused = await runCli([
      'run',
      'pattern',
      'landmark_sequence',
      '--url',
      `${baseUrl}/basic-page.html`,
      '--target',
      'virtual',
      '--session',
      session.sessionId,
      '--json',
   ]);
   const reusedJson = parseJsonOutput(reused.stdout);
   expect(reused.status).toBe(EXIT_SUCCESS);
   expect((reusedJson.result as { sessionId: string }).sessionId).toBe(session.sessionId);
   expect((reusedJson.result as { managedSession: boolean }).managedSession).toBe(false);
   await runCli(['drive', 'stop', '--session', session.sessionId, '--json']);
}

async function assertPatternTextOutput(baseUrl: string): Promise<void> {
   const output = await runCli([
      'run',
      'pattern',
      'landmark_sequence',
      '--url',
      `${baseUrl}/basic-page.html`,
      '--target',
      'virtual',
   ]);
   expect(output.stdout).toMatch(/^Pattern: landmark_sequence\n/);
   expect(output.stdout).toMatch(/Session: drv_[a-f0-9-]+ \(managed\)/);
   expect(output.stdout).toContain('landmark-count=passed');
   expect(output.stdout).toContain('Spoken phrases:');
   expect(output.stdout).toContain('Item text:');
}

async function assertPatternVerboseOutput(baseUrl: string): Promise<void> {
   const verbose = await runCli([
      'run',
      'pattern',
      'landmark_sequence',
      '--url',
      `${baseUrl}/basic-page.html`,
      '--target',
      'virtual',
      '--verbose',
   ]);
   expect(verbose.stdout).toContain('Steps:');
}

describe('cli run pattern commands / focus and sessions', () => {
   it(
      'runs focus visibility pattern',
      () =>
         withTempDir(tempRoots, async () => {
            await assertFocusVisibilityPattern(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_LONG,
   );

   it(
      'reports failed focus obscured pattern',
      () =>
         withTempDir(tempRoots, async () => {
            await assertFocusObscuredFailure(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_LONG,
   );

   it(
      'reuses an existing session',
      () =>
         withTempDir(tempRoots, async () => {
            await assertSessionReuse(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_LONG,
   );

   it(
      'keeps text output readable',
      () =>
         withTempDir(tempRoots, async () => {
            await assertPatternTextOutput(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      'keeps verbose output readable',
      () =>
         withTempDir(tempRoots, async () => {
            await assertPatternVerboseOutput(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_MEDIUM,
   );
});
