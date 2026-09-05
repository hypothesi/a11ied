import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTempRoot } from './fixtures.js';
import {
   type TestServerHandle,
   createTestServer,
   cleanupTempRoots,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   TEST_TIMEOUT_MEDIUM,
} from './setup.js';

const testServer: TestServerHandle = createTestServer();
const tempRoots: string[] = [];

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
   await cleanupTempRoots(tempRoots);
});

async function assertSelectorScopesTheScan(baseUrl: string): Promise<void> {
   const scoped = await runCli([
      'axe',
      `${baseUrl}/button-name-failure.html`,
      '--selector',
      'p',
      '--criterion',
      '4.1.2',
      '--json',
   ]);
   const json = parseJsonOutput(scoped.stdout);
   expect(scoped.status).toBe(EXIT_SUCCESS);
   expect(
      (json.result as { violations: unknown[] }).violations.some(
         (violation) => (violation as { id: string }).id === 'button-name',
      ),
   ).toBe(false);
}

async function assertWaitForBlocksUntilSelectorAppears(baseUrl: string): Promise<void> {
   const result = await runCli([
      'axe',
      `${baseUrl}/basic-page.html`,
      '--wait-for',
      'body',
      '--json',
   ]);
   expect(result.status).toBe(EXIT_SUCCESS);
}

async function assertViewportIsAccepted(baseUrl: string): Promise<void> {
   const result = await runCli([
      'axe',
      `${baseUrl}/basic-page.html`,
      '--viewport',
      '400x300',
      '--json',
   ]);
   expect(result.status).toBe(EXIT_SUCCESS);
}

async function assertInvalidViewportIsRejected(baseUrl: string): Promise<void> {
   const result = await runCli([
      'axe',
      `${baseUrl}/basic-page.html`,
      '--viewport',
      'not-a-size',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(json.ok).toBe(false);
   expect((json.errors as Array<{ code: string }>)[0]?.code).toBe('validation-error');
}

async function assertMultipleTargetsReportSeparately(baseUrl: string): Promise<void> {
   const targetUrls = [
      `${baseUrl}/basic-page.html`,
      `${baseUrl}/button-name-failure.html`,
   ];
   const result = await runCli(['axe', ...targetUrls, '--criterion', '4.1.2', '--json']);
   const json = parseJsonOutput(result.stdout);
   const targets = (json.result as { targets: Array<{ target: { value: string } }> })
      .targets;
   expect(targets).toHaveLength(targetUrls.length);
   expect(targets[0]?.target.value).toContain('basic-page.html');
   expect(targets[1]?.target.value).toContain('button-name-failure.html');
}

async function assertSarifFormatWritesToOut(baseUrl: string): Promise<void> {
   const tempRoot = await createTempRoot(tempRoots);
   const sarifPath = join(tempRoot, 'axe.sarif');

   const result = await runCli([
      'axe',
      `${baseUrl}/button-name-failure.html`,
      '--criterion',
      '4.1.2',
      '--format',
      'sarif',
      '--out',
      sarifPath,
   ]);
   const sarifLog = JSON.parse(await readFile(sarifPath, 'utf8')) as {
      version: string;
      runs: Array<{ results: unknown[] }>;
   };
   expect(sarifLog.version).toBe('2.1.0');
   expect(sarifLog.runs[0]?.results.length).toBeGreaterThan(0);
   expect(result.stdout).toBe('');
}

describe('cli run axe / scan scoping', () => {
   it(
      '--selector scopes the scan to matching elements',
      async () => {
         await assertSelectorScopesTheScan(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      '--wait-for waits for a selector before scanning',
      async () => {
         await assertWaitForBlocksUntilSelectorAppears(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      '--viewport sets the browser viewport',
      async () => {
         await assertViewportIsAccepted(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      'rejects an invalid --viewport value',
      async () => {
         await assertInvalidViewportIsRejected(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );
});

describe('cli run axe / multiple targets and sarif', () => {
   it(
      'scans multiple targets and reports one entry per target',
      async () => {
         await assertMultipleTargetsReportSeparately(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      '--format sarif writes a SARIF 2.1.0 log to --out',
      async () => {
         await assertSarifFormatWritesToOut(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );
});
