import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
   EXIT_ASSERTION,
   EXIT_SUCCESS,
   TEST_TIMEOUT_VERY_LONG,
   parseJsonOutput,
   runCliInProcess,
} from './setup.js';

/*
 * The triage loop. `pattern check` reports what it observed, a person or an agent records
 * what they decided, and the next check sets that row aside until the component changes
 * under it. Without the last part a recorded judgment would stand forever.
 *
 * These run the CLI in process rather than spawning it. Every call here drives a browser,
 * and in process they share one instead of launching a new one each time, which keeps this
 * file from starving the other suites that also need a browser.
 */
const roots: string[] = [];
const FIXTURE = 'packages/cli/test/fixtures/aria-widgets.html';
const SELECTOR = '#stateless-checkbox';
const DEAD_KEY_ROW = 'key-space[1]';

afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function createResultsFile(): Promise<string> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-pattern-evidence-'));
   roots.push(root);
   return join(root, 'evidence.jsonl');
}

async function check(results: string): Promise<{ status: number; stdout: string }> {
   return runCliInProcess([
      'pattern',
      'check',
      FIXTURE,
      '--pattern',
      'checkbox',
      '--selector',
      SELECTOR,
      '--results',
      results,
   ]);
}

async function record(results: string, outcome: string): Promise<{ status: number }> {
   return runCliInProcess([
      'pattern',
      'record',
      FIXTURE,
      '--pattern',
      'checkbox',
      '--row',
      DEAD_KEY_ROW,
      '--outcome',
      outcome,
      '--selector',
      SELECTOR,
      '--note',
      'this control is display-only in our design',
      '--results',
      results,
   ]);
}

async function pendingRows(results: string): Promise<string[]> {
   const run = await runCliInProcess([
      'pattern',
      'pending',
      FIXTURE,
      '--pattern',
      'checkbox',
      '--results',
      results,
      '--json',
   ]);

   return (parseJsonOutput(run.stdout).result as { pending: string[] }).pending;
}

describe('the pattern triage loop', () => {
   it(
      'sets a row aside once someone records it as inapplicable',
      async () => {
         const results = await createResultsFile();

         const before = await check(results);
         const recorded = await record(results, 'inapplicable');
         const after = await check(results);

         expect(before.status).toBe(EXIT_ASSERTION);
         expect(recorded.status).toBe(EXIT_SUCCESS);
         expect(after.status).toBe(EXIT_SUCCESS);
         expect(after.stdout).toContain('Already judged');
      },
      TEST_TIMEOUT_VERY_LONG,
   );
});

describe('the pattern pending list', () => {
   it(
      'lists the rows nobody has judged, and stops listing one that was judged',
      async () => {
         const results = await createResultsFile();

         const before = await pendingRows(results);
         await record(results, 'inapplicable');
         const after = await pendingRows(results);

         expect(before).toContain(DEAD_KEY_ROW);
         expect(after).not.toContain(DEAD_KEY_ROW);
      },
      TEST_TIMEOUT_VERY_LONG,
   );
});

describe('the pattern record command', () => {
   it(
      'rejects a row key the example does not have',
      async () => {
         const results = await createResultsFile();

         const result = await runCliInProcess([
            'pattern',
            'record',
            FIXTURE,
            '--pattern',
            'checkbox',
            '--row',
            'no-such-row[9]',
            '--outcome',
            'inapplicable',
            '--selector',
            SELECTOR,
            '--results',
            results,
            '--json',
         ]);

         expect(result.stdout).toContain('pattern-row-not-found');
      },
      TEST_TIMEOUT_VERY_LONG,
   );
});
