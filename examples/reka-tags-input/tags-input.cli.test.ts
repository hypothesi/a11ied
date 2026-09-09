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
 * The same tags input demo checked with the CLI: axe against the widget, the tree for the
 * field's name, and a batch script for the keys.
 */
const TAGS_URL = 'https://reka-ui.com/docs/components/tags-input';
/** The widget's root: the one element that holds the field and the tags. */
const TAGS_SELECTOR = 'main div[dir="ltr"]:has(> input[placeholder="Fruits..."])';
const BATCH_FILE = fileURLToPath(new URL('tags-input.batch.jsonl', import.meta.url));

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
   it('passes every A and AA rule axe runs against the widget', async () => {
      const run = await scanAtAA(TAGS_URL, TAGS_SELECTOR);

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isAxeResult(run.result) ? run.result : undefined).toMatchObject({
         violations: [],
         verdict: { passed: true },
      });
   });
});

describe('the accessibility tree', () => {
   // WCAG 4.1.2 Name, Role, Value: the field needs a name, not only a placeholder.
   it('names the text field', async () => {
      const run = await runA1Json(['tree', TAGS_URL, '--role', 'textbox']);
      const fields = isTreeResult(run.result)
         ? flatten(run.result.nodes).filter((node) => node.role === 'textbox')
         : [];

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(fields.map((node) => node.name)).toEqual([expect.stringMatching(/\S/u)]);
   });
});

describe('the keys, through a batch script', () => {
   it('passes every expect line in tags-input.batch.jsonl', async () => {
      const dir = await createTempDir();
      disposers.push(dir.dispose);
      const run = await runBatch(TAGS_URL, BATCH_FILE, { stateDir: dir.path });

      expect(run.status).toBe(EXIT_SUCCESS);
      expect(isBatchResult(run.result) ? run.result : undefined).toMatchObject({
         failedExpectations: 0,
         failedActions: 0,
         exitCode: EXIT_SUCCESS,
      });
   });
});
