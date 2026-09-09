import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupTempRoots, createTempRoot } from '../testing/fixtures.js';
import { runNode, TEST_TIMEOUT_LONG, TEST_TIMEOUT_MEDIUM } from '../testing/setup.js';
import { test } from './index.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const tempRoots: string[] = [];

const CHECKOUT_HTML = `
<!doctype html>
<html lang="en">
  <head><title>Checkout</title></head>
  <body>
    <main>
      <h1>Checkout</h1>
      <p>Two items in your cart.</p>
      <button type="button">Pay now</button>
    </main>
  </body>
</html>
`;

const checkout = test.extend({ srOptions: { html: CHECKOUT_HTML } });

interface AssertionResult {
   status: string;
   failureMessages: string[];
}

function isAssertionResult(value: unknown): value is AssertionResult {
   return (
      typeof value === 'object' &&
      value !== null &&
      'status' in value &&
      'failureMessages' in value &&
      Array.isArray(value.failureMessages)
   );
}

/** The `assertionResults` of the one file the spawned run covers. */
function listAssertionResults(report: unknown): AssertionResult[] {
   if (typeof report !== 'object' || report === null || !('testResults' in report)) {
      throw new Error('The JSON report has no testResults.');
   }
   const [file] = Array.isArray(report.testResults) ? report.testResults : [];
   if (typeof file !== 'object' || file === null || !('assertionResults' in file)) {
      throw new Error('The JSON report has no assertionResults.');
   }
   const results = Array.isArray(file.assertionResults) ? file.assertionResults : [];
   return results.filter((result: unknown) => isAssertionResult(result));
}

async function runQueuedFailureFixture(): Promise<AssertionResult[]> {
   const outputFile = join(await createTempRoot(tempRoots), 'report.json');
   const result = await runNode(join(REPO_ROOT, 'node_modules/vitest/vitest.mjs'), [
      'run',
      '--config',
      'vitest.queued-failure.config.ts',
      '--reporter=json',
      `--outputFile=${outputFile}`,
   ]);

   expect(result.status, result.stderr).toBe(1);
   const report: unknown = JSON.parse(await readFile(outputFile, 'utf8'));
   return listAssertionResults(report);
}

afterEach(async () => {
   await cleanupTempRoots(tempRoots);
});

describe('the queued sr fixture', () => {
   checkout(
      'runs commands and assertions without an await',
      ({ sr }) => {
         sr.next('heading');
         sr.expectSpoken('Checkout');
         sr.next('button');
         sr.expectOn({ role: 'button', name: 'Pay now' });
         sr.expectSpokenInOrder(['Checkout', 'Pay now']);
      },
      TEST_TIMEOUT_MEDIUM,
   );

   checkout(
      'awaits one call for its value, after everything queued before it',
      async ({ sr }) => {
         sr.next('heading');
         sr.next('button');
         const item = await sr.read();

         expect(item).toMatchObject({ role: 'button', name: 'Pay now' });
      },
      TEST_TIMEOUT_MEDIUM,
   );

   checkout(
      'still accepts the awaited style and the expect matchers',
      async ({ sr }) => {
         await sr.next('heading');

         await expect(sr).toHaveSpoken('Checkout');
         await expect(sr).toBeOn({ role: 'heading', name: 'Checkout' });
         expect(sr.session.engine).toBe('jsdom');
      },
      TEST_TIMEOUT_MEDIUM,
   );
});

describe('a queued failure nobody awaited', () => {
   it(
      'fails the spawned test itself, with the assertion message and a code frame',
      async () => {
         const [unawaited, awaited, bodyError] = await runQueuedFailureFixture();

         expect(unawaited).toMatchObject({ status: 'failed' });
         expect(unawaited?.failureMessages).toHaveLength(1);
         expect(unawaited?.failureMessages[0]).toContain(
            '"Refund" was not announced in the transcript',
         );
         expect(unawaited?.failureMessages[0]).toMatch(
            /packages\/cli\/test\/fixtures\/queued-failure\.test\.ts:\d+:\d+/u,
         );
         expect(awaited).toMatchObject({ status: 'passed' });
         expect(bodyError).toMatchObject({ status: 'failed' });
         expect(bodyError?.failureMessages).toHaveLength(1);
         expect(bodyError?.failureMessages[0]).toContain('thrown by the test body');
      },
      TEST_TIMEOUT_LONG,
   );
});
