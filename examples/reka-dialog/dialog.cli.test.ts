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
   type Judgment,
   type PatternTarget,
} from '../lib/a1-results.js';
import { createTempDir } from '../lib/run-a1.js';

/*
 * The same dialog demo checked with the CLI. The dialog is not on the page until its
 * button is clicked, so every page command here passes `--click` for the trigger.
 */
const DIALOG_URL = 'https://reka-ui.com/docs/components/dialog';
const DIALOG: PatternTarget = {
   url: DIALOG_URL,
   example: 'dialog',
   selector: '[role="dialog"]',
   /** A Playwright selector: the one button in the main column with this text. */
   click: 'main button:has-text("Edit profile")',
   recordedBy: 'examples/reka-dialog',
};
const BATCH_FILE = fileURLToPath(new URL('dialog.batch.jsonl', import.meta.url));
const ARIA_MODAL_ROW = 'aria-modal[3]';
const KEYBOARD_ROWS = ['key-tab[0]', 'key-shift-tab[1]', 'key-escape[2]'];

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
   it('passes every A and AA rule axe runs inside the open dialog', async () => {
      const run = await scanAtAA(DIALOG_URL, DIALOG.selector, DIALOG.click);

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isAxeResult(run.result) ? run.result : undefined).toMatchObject({
         violations: [],
         verdict: { passed: true },
      });
   });
});

describe('the APG modal dialog example', () => {
   it('sets every attribute but aria-modal, and no declared key is dead', async () => {
      const check = await checkPattern(DIALOG);

      const deadKeys = check.keyboardRows.filter(
         (row) => row.status === 'no-observable-effect',
      );
      const missing = check.attributeRows
         .filter((row) => row.status !== 'present')
         .map((row) => row.rowKey);

      expect(deadKeys).toEqual([]);
      // The demo hides the rest of the page with aria-hidden instead of aria-modal.
      expect(missing).toEqual([ARIA_MODAL_ROW]);
      expect(check.applicabilityHints.map((hint) => hint.attribute)).toEqual([
         'aria-modal',
      ]);
   });
});

describe('the keyboard rows, judged through a batch script', () => {
   it('passes every expect line in dialog.batch.jsonl', async () => {
      const run = await runBatch(DIALOG_URL, BATCH_FILE, { stateDir: await tempDir() });

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isBatchResult(run.result) ? run.result : undefined).toMatchObject({
         failedExpectations: 0,
         failedActions: 0,
         exitCode: EXIT_SUCCESS,
      });
   });
});

describe('the triage loop', () => {
   it('records the judged rows, so the next check sets them aside', async () => {
      const results = join(await tempDir(), 'evidence.jsonl');
      const judgments: Judgment[] = [
         ...KEYBOARD_ROWS.map((rowKey) => ({
            rowKey,
            outcome: 'passed' as const,
            note: `verified by ${BATCH_FILE}`,
         })),
         {
            rowKey: ARIA_MODAL_ROW,
            outcome: 'inapplicable',
            note: 'The rest of the page is hidden with aria-hidden while the dialog is open.',
         },
      ];

      await recordRows(DIALOG, judgments, results);
      const pending = await pendingRows(DIALOG, results);
      const check = await checkPattern(DIALOG, { results });
      const judged = [...check.keyboardRows, ...check.attributeRows]
         .filter((row) => row.recorded !== undefined)
         .map((row) => [row.rowKey, row.recorded?.outcome, row.recorded?.stale]);

      // The three rows the check passed on its own were never recorded, so they stay pending.
      expect(pending).toMatchObject({
         pending: ['dialog-role[0]', 'aria-labelledby[1]', 'aria-describedby[2]'],
      });
      expect(judged).toEqual(
         judgments.map((judgment) => [judgment.rowKey, judgment.outcome, false]),
      );
   });
});
