import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
   checkPattern,
   EXIT_SUCCESS,
   isAxeResult,
   isBatchResult,
   pendingRows,
   recordRows,
   runBatch,
   scanAtAA,
   type PatternTarget,
} from '../lib/a1-results.js';
import { createTempDir } from '../lib/run-a1.js';

/*
 * The same accordion demo checked with the CLI: axe for the automated WCAG rules, the
 * APG check for the pattern's keyboard and attribute rows, a batch script for the rows a
 * person has to judge, and the record and pending commands that close that loop.
 */
const ACCORDION_URL = 'https://reka-ui.com/docs/components/accordion';
const ACCORDION: PatternTarget = {
   url: ACCORDION_URL,
   example: 'accordion',
   /** The demo's root: the one element whose children hold an h3 with a disclosure button. */
   selector: 'div:has(> div[data-state] > h3 > button[aria-expanded])',
   recordedBy: 'examples/reka-accordion',
};
const BATCH_FILE = fileURLToPath(new URL('accordion.batch.jsonl', import.meta.url));
const KEYBOARD_ROWS = ['key-enter-or-space[0]', 'key-tab[1]', 'key-shift-tab[2]'];

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
   await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

async function tempDir(): Promise<string> {
   const dir = await createTempDir();
   disposers.push(dir.dispose);
   return dir.path;
}

describe('automated WCAG checks', () => {
   it('passes every A and AA rule axe runs against the demo', async () => {
      const run = await scanAtAA(ACCORDION_URL, ACCORDION.selector);

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isAxeResult(run.result) ? run.result : undefined).toMatchObject({
         violations: [],
         verdict: { passed: true },
      });
   });
});

describe('the APG accordion example', () => {
   it('sets every attribute the example documents, and no declared key is dead', async () => {
      const check = await checkPattern(ACCORDION);

      const deadKeys = check.keyboardRows.filter(
         (row) => row.status === 'no-observable-effect',
      );
      const missing = check.attributeRows
         .filter((row) => row.status !== 'present' && row.status !== 'not-testable')
         .map((row) => `${row.rowKey}: ${row.status}, ${row.reason ?? ''}`);

      expect(deadKeys).toEqual([]);
      expect(missing).toEqual([]);
   });
});

describe('the keyboard rows, judged through a batch script', () => {
   it('passes every expect line in accordion.batch.jsonl', async () => {
      const run = await runBatch(ACCORDION_URL, BATCH_FILE, {
         stateDir: await tempDir(),
      });

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isBatchResult(run.result) ? run.result : undefined).toMatchObject({
         failedExpectations: 0,
         failedActions: 0,
         exitCode: EXIT_SUCCESS,
      });
   });
});

describe('the triage loop', () => {
   it('records the rows the script covered, so the next check sets them aside', async () => {
      const results = join(await tempDir(), 'evidence.jsonl');
      const judgments = KEYBOARD_ROWS.map((rowKey) => ({
         rowKey,
         outcome: 'passed' as const,
         note: `verified by ${BATCH_FILE}`,
      }));

      await recordRows(ACCORDION, judgments, results);
      const pending = await pendingRows(ACCORDION, results);
      const check = await checkPattern(ACCORDION, { results });

      expect(pending).toMatchObject({
         pending: expect.not.arrayContaining(KEYBOARD_ROWS),
      });
      expect(check.keyboardRows.map((row) => [row.rowKey, row.recorded])).toEqual(
         KEYBOARD_ROWS.map((rowKey) => [
            rowKey,
            expect.objectContaining({
               outcome: 'passed',
               stale: false,
               assertedBy: ACCORDION.recordedBy,
            }),
         ]),
      );
   });
});
