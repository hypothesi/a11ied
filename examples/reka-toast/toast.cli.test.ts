import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
   EXIT_SUCCESS,
   isAxeResult,
   isBatchResult,
   runBatch,
   scanAtAA,
} from '../lib/a1-results.js';
import { createTempDir, runA1Json } from '../lib/run-a1.js';

/*
 * The same toast demo checked with the CLI. The toast is not on the page until its button
 * is pressed, so the page commands pass `--click` for the trigger.
 */
const TOAST_URL = 'https://reka-ui.com/docs/components/toast';
const TRIGGER_SELECTOR = 'main button:has-text("Add to calendar")';
/** The viewport that holds every toast, named with its hotkey. */
const VIEWPORT_SELECTOR = '[role="region"][aria-label^="Notifications"]';
const BATCH_FILE = fileURLToPath(new URL('toast.batch.jsonl', import.meta.url));

interface TreeNode {
   role: string;
   name?: string;
   children: TreeNode[];
}

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
   await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function isTreeResult(value: unknown): value is { nodes: TreeNode[] } {
   return typeof value === 'object' && value !== null && 'nodes' in value;
}

function flatten(nodes: TreeNode[]): TreeNode[] {
   return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

describe('automated WCAG checks', () => {
   it('passes every A and AA rule axe runs against the open toast', async () => {
      const run = await scanAtAA(TOAST_URL, VIEWPORT_SELECTOR, TRIGGER_SELECTOR);

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isAxeResult(run.result) ? run.result : undefined).toMatchObject({
         violations: [],
         verdict: { passed: true },
      });
   });
});

describe('the accessibility tree', () => {
   // WCAG 4.1.3 Status Messages: the live region must be exposed to be announced.
   it('exposes the announcement as an alert', async () => {
      const run = await runA1Json([
         'tree',
         TOAST_URL,
         '--click',
         TRIGGER_SELECTOR,
         '--role',
         'alert',
      ]);
      const alerts = isTreeResult(run.result)
         ? flatten(run.result.nodes).filter((node) => node.role === 'alert')
         : [];

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(alerts.length).toBeGreaterThan(0);
   });
});

describe('the keys, through a batch script', () => {
   it('passes every expect line in toast.batch.jsonl', async () => {
      const dir = await createTempDir();
      disposers.push(dir.dispose);
      const run = await runBatch(TOAST_URL, BATCH_FILE, { stateDir: dir.path });

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isBatchResult(run.result) ? run.result : undefined).toMatchObject({
         failedExpectations: 0,
         failedActions: 0,
         exitCode: EXIT_SUCCESS,
      });
   });
});
