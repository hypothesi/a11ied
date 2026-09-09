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
 * The same progress demo checked with the CLI. There is no APG progress bar example, so
 * axe, the tree, and the batch script are the whole of it.
 */
const PROGRESS_URL = 'https://reka-ui.com/docs/components/progress';
const PROGRESS_SELECTOR = 'main [role="progressbar"]';
const BATCH_FILE = fileURLToPath(new URL('progress.batch.jsonl', import.meta.url));

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
   it('passes every A and AA rule axe runs against the progress bar', async () => {
      const run = await scanAtAA(PROGRESS_URL, PROGRESS_SELECTOR);

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isAxeResult(run.result) ? run.result : undefined).toMatchObject({
         violations: [],
         verdict: { passed: true },
      });
   });
});

describe('the accessibility tree', () => {
   it('holds one progressbar named by its percentage', async () => {
      const run = await runA1Json(['tree', PROGRESS_URL, '--role', 'progressbar']);
      const bars = isTreeResult(run.result)
         ? flatten(run.result.nodes).filter((node) => node.role === 'progressbar')
         : [];

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(bars.map((node) => node.name)).toEqual([expect.stringMatching(/^\d+%$/u)]);
   });
});

describe('the value over time, through a batch script', () => {
   it('passes every expect line in progress.batch.jsonl', async () => {
      const dir = await createTempDir();
      disposers.push(dir.dispose);
      const run = await runBatch(PROGRESS_URL, BATCH_FILE, { stateDir: dir.path });

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isBatchResult(run.result) ? run.result : undefined).toMatchObject({
         failedExpectations: 0,
         failedActions: 0,
         exitCode: EXIT_SUCCESS,
      });
   });
});
