import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
   EXIT_SUCCESS,
   isAxeResult,
   isBatchResult,
   runBatch,
   scanAtAA,
} from '../lib/a1-results.js';
import { createTempDir } from '../lib/run-a1.js';

/*
 * The same tooltip demo checked with the CLI. There is no APG tooltip example, so axe
 * and the batch script are the whole of it.
 */
const TOOLTIP_URL = 'https://reka-ui.com/docs/components/tooltip';
/** The demo's trigger: the one hover-area button in the main column with no aria-label. */
const TRIGGER_SELECTOR = 'main button[data-grace-area-trigger]:not([aria-label])';
const BATCH_FILE = fileURLToPath(new URL('tooltip.batch.jsonl', import.meta.url));

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
   await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

describe('automated WCAG checks', () => {
   it('passes every A and AA rule axe runs against the trigger', async () => {
      const run = await scanAtAA(TOOLTIP_URL, TRIGGER_SELECTOR);

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isAxeResult(run.result) ? run.result : undefined).toMatchObject({
         violations: [],
         verdict: { passed: true },
      });
   });
});

describe('focus and Escape, through a batch script', () => {
   it('passes every expect line in tooltip.batch.jsonl', async () => {
      const dir = await createTempDir();
      disposers.push(dir.dispose);
      const run = await runBatch(TOOLTIP_URL, BATCH_FILE, { stateDir: dir.path });

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isBatchResult(run.result) ? run.result : undefined).toMatchObject({
         failedExpectations: 0,
         failedActions: 0,
         exitCode: EXIT_SUCCESS,
      });
   });
});
