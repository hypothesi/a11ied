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
   EXIT_ASSERTION,
   EXIT_SUCCESS,
   EXIT_USAGE,
   TEST_TIMEOUT_LONG,
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

async function assertAxeFailOnFiltersByImpact(baseUrl: string): Promise<void> {
   const withoutFailOn = await runCli([
      'axe',
      `${baseUrl}/contrast-failure.html`,
      '--level',
      'AA',
      '--json',
   ]);
   expect(withoutFailOn.status).toBe(EXIT_ASSERTION);

   const withFailOn = await runCli([
      'axe',
      `${baseUrl}/contrast-failure.html`,
      '--level',
      'AA',
      '--fail-on',
      'critical',
      '--json',
   ]);
   const json = parseJsonOutput(withFailOn.stdout);
   expect(withFailOn.status).toBe(EXIT_SUCCESS);
   expect(
      (
         json.result as { violations: Array<{ id: string; impact: string }> }
      ).violations.some((entry) => entry.id === 'color-contrast'),
   ).toBe(true);
}

async function assertAxeInvalidFailOn(baseUrl: string): Promise<void> {
   const result = await runCli([
      'axe',
      `${baseUrl}/basic-page.html`,
      '--fail-on',
      'catastrophic',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_USAGE);
   expect((json.errors as Array<{ code: string }>)[0]?.code).toBe('validation-error');
}

async function assertAxeBaselineRoundTrip(baseUrl: string): Promise<void> {
   const tempRoot = await createTempRoot(tempRoots);
   const baselinePath = join(tempRoot, 'axe-baseline.json');

   const updated = await runCli([
      'axe',
      `${baseUrl}/button-name-failure.html`,
      '--criterion',
      '4.1.2',
      '--baseline',
      baselinePath,
      '--update-baseline',
      '--json',
   ]);
   expect(updated.status).toBe(EXIT_SUCCESS);
   const baselineFile = JSON.parse(await readFile(baselinePath, 'utf8')) as {
      acceptedFindings: string[];
   };
   expect(
      baselineFile.acceptedFindings.some((key) => key.startsWith('button-name::')),
   ).toBe(true);

   const accepted = await runCli([
      'axe',
      `${baseUrl}/button-name-failure.html`,
      '--criterion',
      '4.1.2',
      '--baseline',
      baselinePath,
      '--json',
   ]);
   const acceptedJson = parseJsonOutput(accepted.stdout);
   expect(accepted.status).toBe(EXIT_SUCCESS);
   expect(
      (acceptedJson.result as { verdict: { baselinedCount: number } }).verdict
         .baselinedCount,
   ).toBeGreaterThan(0);
}

async function assertAxeMissingBaselinePath(baseUrl: string): Promise<void> {
   const result = await runCli([
      'axe',
      `${baseUrl}/basic-page.html`,
      '--update-baseline',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_USAGE);
   expect((json.errors as Array<{ code: string }>)[0]?.code).toBe(
      'missing-baseline-path',
   );
}

describe('cli run axe / verdict', () => {
   it(
      '--fail-on filters which impacts count toward the verdict',
      async () => {
         await assertAxeFailOnFiltersByImpact(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'rejects an unsupported --fail-on value',
      async () => {
         await assertAxeInvalidFailOn(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      '--update-baseline accepts current findings, then --baseline honors them',
      async () => {
         await assertAxeBaselineRoundTrip(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      '--update-baseline requires --baseline',
      async () => {
         await assertAxeMissingBaselinePath(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );
});
