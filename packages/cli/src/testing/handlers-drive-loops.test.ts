import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
   withStateDir,
   runCli,
   parseJsonOutput,
   EXIT_ASSERTION,
   EXIT_SUCCESS,
   EXIT_USAGE,
   TEST_TIMEOUT_LONG,
   useTestServer,
} from './setup.js';
import { expectFirstErrorMessage } from './helpers.js';

const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);
const startArgs = ['--sr', 'virtual', '--allow-virtual', '--idle-timeout', '1'];

interface LoopItemShape {
   index: number;
   phrase: string;
   role?: string;
   name?: string;
   level?: number;
}

interface LoopDetails {
   kind?: string;
   count?: number;
   items?: LoopItemShape[];
   stoppedAt?: string;
   found?: boolean;
   steps?: number;
}

interface LoopResult {
   action: string;
   state: { lastSpokenPhrase: string | null };
   details?: LoopDetails;
}

async function runSrJson(
   args: string[],
): Promise<{ status: number; result: LoopResult; errors: Array<{ code: string }> }> {
   const run = await runCli(['sr', ...args, '--json']);
   const json = parseJsonOutput(run.stdout);
   return {
      status: run.status,
      result: json.result as LoopResult,
      errors: json.errors as Array<{ code: string }>,
   };
}

function withSession(fn: () => Promise<void>): () => Promise<void> {
   return () =>
      withStateDir(tempRoots, async () => {
         const pageUrl = `${testServer.getBaseUrl()}/structure.html`;
         const started = await runCli(['sr', 'start', pageUrl, ...startArgs, '--json']);
         expect(started.status).toBe(EXIT_SUCCESS);
         try {
            await fn();
         } finally {
            await runCli(['sr', 'stop', '--json']);
         }
      });
}

async function assertElements(): Promise<void> {
   const headings = await runSrJson(['elements', 'heading']);
   expect(headings.status).toBe(EXIT_SUCCESS);
   expect(headings.result.details?.stoppedAt).toBe('end');
   expect(headings.result.details?.items?.map((item) => item.name)).toEqual([
      'Structure page',
      'Products',
      'Pricing',
      'Sign up',
   ]);
   const pricing = headings.result.details?.items?.find(
      (item) => item.name === 'Pricing',
   );
   expect(pricing).toMatchObject({
      index: 3,
      role: 'heading',
      level: 3,
      phrase: 'heading, Pricing, level 3',
   });

   const capped = await runSrJson(['elements', 'landmark', '--max', '2']);
   expect(capped.result.details).toMatchObject({ count: 2, stoppedAt: 'cap' });

   const text = await runCli(['sr', 'elements', 'link']);
   expect(text.stdout).toContain('2 link elements from the top of the page.');
   expect(text.stdout).toContain('1. link: About us');
   expect(text.stdout).toContain('Stopped at the end of the document.');

   const bad = await runCli(['sr', 'elements', 'item', '--json']);
   expectFirstErrorMessage({ result: bad, match: /not a kind you can list/ });
}

async function assertReadAll(): Promise<void> {
   await runSrJson(['next', 'heading', '--level', '3']);
   const all = await runSrJson(['read-all']);
   expect(all.status).toBe(EXIT_SUCCESS);
   expect(all.result.details?.stoppedAt).toBe('end');
   expect(all.result.details?.items?.[0]?.phrase).toBe('table, Plans');
   expect(all.result.details?.items?.at(-1)?.phrase).toBe('end of document');

   await runSrJson(['top']);
   const capped = await runSrJson(['read-all', '--max', '3']);
   expect(capped.result.details?.items?.map((item) => item.phrase)).toEqual([
      'banner',
      'heading, Structure page, level 1',
      'navigation, Site',
   ]);
   expect(capped.result.details?.stoppedAt).toBe('cap');

   const text = await runCli(['sr', 'read-all', '--max', '2']);
   expect(text.stdout).toContain('2 phrases from the cursor onward.');
   expect(text.stdout).toContain('raise --max to see more');
}

async function assertGoto(): Promise<void> {
   const link = await runSrJson(['goto', '--role', 'link', '--name', 'learn more']);
   expect(link.status).toBe(EXIT_SUCCESS);
   expect(link.result.details).toMatchObject({ found: true, kind: 'link' });
   expect(link.result.state.lastSpokenPhrase).toBe('link, Learn more');

   const again = await runSrJson(['goto', '--name', 'Learn more']);
   expect(again.result.details).toMatchObject({ found: true, steps: 0 });

   const button = await runSrJson(['goto', '--role', 'button']);
   expect(button.result.state.lastSpokenPhrase).toBe('button, Create account');

   const missing = await runSrJson(['goto', '--name', 'not on this page']);
   expect(missing.status).toBe(EXIT_ASSERTION);
   expect(missing.errors[0]?.code).toBe('item-not-found');
   expect(missing.result.details).toMatchObject({ found: false, stoppedAt: 'end' });

   const none = await runCli(['sr', 'goto', '--json']);
   expect(none.status).toBe(EXIT_USAGE);
   expectFirstErrorMessage({ result: none, match: /Pass --role, --name, or both/ });
}

const WALK_MAX = 4;

async function assertWalk(stateDir: string): Promise<void> {
   const pageUrl = `${testServer.getBaseUrl()}/structure.html`;
   const outPath = resolve(stateDir, 'walk.md');
   try {
      const walked = await runCli([
         'sr',
         'walk',
         pageUrl,
         '--sr',
         'virtual',
         '--allow-virtual',
         '--max',
         String(WALK_MAX),
         '--out',
         outPath,
         '--json',
      ]);
      expect(walked.status).toBe(EXIT_SUCCESS);
      const json = parseJsonOutput(walked.stdout);
      expect((json.warnings as Array<{ code: string }>)[0]?.code).toBe(
         'session-auto-started',
      );
      const transcript = (json.result as { transcript: { entries: unknown[] } })
         .transcript;
      expect(transcript.entries).toHaveLength(WALK_MAX);
      expect(await readFile(outPath, 'utf8')).toContain('link, About us');

      const again = await runCli(['sr', 'walk', '--max', '2']);
      expect(again.stdout).not.toContain('session-auto-started');
      expect(again.stdout).toContain('banner');
      expect(again.stdout).toContain('Stopped at the cap of 2 items');
   } finally {
      await runCli(['sr', 'stop', '--json']);
   }
}

describe('cli sr bounded loops', () => {
   it(
      'walks a page from a cold start and writes the transcript',
      () => withStateDir(tempRoots, assertWalk),
      TEST_TIMEOUT_LONG,
   );

   it(
      'lists elements of one kind from the top',
      withSession(assertElements),
      TEST_TIMEOUT_LONG,
   );

   it(
      'reads to the end of the document or the cap',
      withSession(assertReadAll),
      TEST_TIMEOUT_LONG,
   );

   it('steps to a matching item or exits 4', withSession(assertGoto), TEST_TIMEOUT_LONG);
});
