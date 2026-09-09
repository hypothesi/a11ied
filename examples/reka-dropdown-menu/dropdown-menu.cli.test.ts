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
 * The same dropdown menu demo checked with the CLI. The APG example has two keyboard
 * tables: one for the button, checked on the page as it loads, and one for the open menu,
 * checked after a click opens it and Down Arrow moves focus to the first item.
 */
const MENU_URL = 'https://reka-ui.com/docs/components/dropdown-menu';
const TRIGGER_SELECTOR = 'main button[aria-haspopup="menu"]';
const BUTTON: PatternTarget = {
   url: MENU_URL,
   example: 'menu-button-actions',
   selector: TRIGGER_SELECTOR,
   recordedBy: 'examples/reka-dropdown-menu',
};
const MENU: PatternTarget = {
   ...BUTTON,
   selector: '[role="menu"]',
   click: TRIGGER_SELECTOR,
};
const BATCH_FILE = fileURLToPath(new URL('dropdown-menu.batch.jsonl', import.meta.url));
const UP_ARROW_ROW = 'menu-button-key-up-arrow[1]';
const OPEN_ROW = 'menu-button-key-open[0]';
const CONTROLS_ROW = 'menu-button-aria-controls[1]';

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
   await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

async function tempDir(): Promise<string> {
   const dir = await createTempDir();
   disposers.push(dir.dispose);
   return dir.path;
}

function deadKeysIn(rows: Array<{ rowKey: string; status: string }>): string[] {
   return rows
      .filter((row) => row.status === 'no-observable-effect')
      .map((row) => row.rowKey);
}

describe('automated WCAG checks', () => {
   it('passes every A and AA rule axe runs against the button', async () => {
      const run = await scanAtAA(MENU_URL, TRIGGER_SELECTOR);

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isAxeResult(run.result) ? run.result : undefined).toMatchObject({
         violations: [],
         verdict: { passed: true },
      });
   });

   it('passes every A and AA rule axe runs inside the open menu', async () => {
      const run = await scanAtAA(MENU_URL, MENU.selector, MENU.click);

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isAxeResult(run.result) ? run.result : undefined).toMatchObject({
         violations: [],
         verdict: { passed: true },
      });
   });
});

describe('the APG actions menu button example', () => {
   it('opens on the keys the button table declares, and sets its attributes', async () => {
      const check = await checkPattern(BUTTON);
      const missing = check.attributeRows
         .filter((row) => row.status !== 'present')
         .map((row) => `${row.rowKey}: ${row.status}, ${row.reason ?? ''}`);

      // Up Arrow is optional in the pattern; the demo opens on Down Arrow, Space, and Enter.
      expect(deadKeysIn(check.keyboardRows)).toEqual([UP_ARROW_ROW]);
      // The menu is not on the page until it opens, so the button refers to it only then.
      expect(missing).toEqual([`${CONTROLS_ROW}: absent, `]);
   });

   it('moves through the open menu on every key the menu table declares', async () => {
      const check = await checkPattern(MENU, { table: 'Menu', setup: 'ArrowDown' });
      const untested = check.keyboardRows
         .filter((row) => row.status === 'not-testable')
         .map((row) => row.rowKey);

      expect(deadKeysIn(check.keyboardRows)).toEqual([]);
      // A-Z is a range of keys, which the check cannot press as one chord.
      expect(untested).toEqual(['menu-key-character[6]']);
   });
});

describe('the keyboard rows, judged through a batch script', () => {
   it('passes every expect line in dropdown-menu.batch.jsonl', async () => {
      const run = await runBatch(MENU_URL, BATCH_FILE, { stateDir: await tempDir() });

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isBatchResult(run.result) ? run.result : undefined).toMatchObject({
         failedExpectations: 0,
         failedActions: 0,
         exitCode: EXIT_SUCCESS,
      });
   });
});

describe('the triage loop', () => {
   it('records the button rows, so the next check sets them aside', async () => {
      const results = join(await tempDir(), 'evidence.jsonl');
      const judgments: Judgment[] = [
         { rowKey: OPEN_ROW, outcome: 'passed', note: `verified by ${BATCH_FILE}` },
         {
            rowKey: UP_ARROW_ROW,
            outcome: 'inapplicable',
            note: 'Optional in the pattern. The menu opens on Down Arrow, Space, and Enter.',
         },
         {
            rowKey: CONTROLS_ROW,
            outcome: 'passed',
            note: 'Set while the menu is open, which is the only time the menu is on the page.',
         },
      ];

      await recordRows(BUTTON, judgments, results);
      const pending = await pendingRows(BUTTON, results);
      const check = await checkPattern(BUTTON, { results });

      const judged = [...check.keyboardRows, ...check.attributeRows]
         .filter((row) => row.recorded !== undefined)
         .map((row) => [row.rowKey, row.recorded?.outcome]);

      expect(pending).toMatchObject({
         pending: expect.not.arrayContaining([OPEN_ROW, UP_ARROW_ROW, CONTROLS_ROW]),
      });
      expect(judged).toEqual(
         judgments.map((judgment) => [judgment.rowKey, judgment.outcome]),
      );
   });
});
