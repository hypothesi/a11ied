import { describe, expect, it } from 'vitest';

import {
   withStateDir,
   runCli,
   parseJsonOutput,
   EXIT_ASSERTION,
   EXIT_SUCCESS,
   TEST_TIMEOUT_LONG,
   useTestServer,
} from './setup.js';
import { expectFirstErrorMessage } from './helpers.js';

const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);
const startArgs = ['--sr', 'virtual', '--allow-virtual', '--idle-timeout', '1'];

interface StructureResult {
   action: string;
   state: { lastSpokenPhrase: string | null };
   details?: Record<string, unknown>;
}

async function runSrJson(
   args: string[],
): Promise<{ status: number; result: StructureResult; errors: Array<{ code: string }> }> {
   const run = await runCli(['sr', ...args, '--json']);
   const json = parseJsonOutput(run.stdout);
   return {
      status: run.status,
      result: json.result as StructureResult,
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

async function assertFindMissing(): Promise<void> {
   const missing = await runSrJson(['find', 'not on this page']);
   expect(missing.status).toBe(EXIT_ASSERTION);
   expect(missing.result.details).toEqual({ text: 'not on this page', found: false });
   expect(missing.errors[0]?.code).toBe('text-not-found');
   expect(missing.result.state.lastSpokenPhrase).toBe('link, Learn more');

   const text = await runCli(['sr', 'find', 'not on this page']);
   expect(text.status).toBe(EXIT_ASSERTION);
   expect(text.stdout).toContain('Found:');
   expect(text.stdout).toContain('was not found on the page');
}

async function assertScreenshotNeedsVoiceOver(): Promise<void> {
   const denied = await runCli(['sr', 'screenshot', './shot.png', '--json']);
   expectFirstErrorMessage({
      result: denied,
      match: /sr screenshot is not available on virtual/,
   });
}

async function assertTitleAndFind(): Promise<void> {
   const title = await runSrJson(['title']);
   expect(title.status).toBe(EXIT_SUCCESS);
   expect(title.result.details).toEqual({
      title: 'Structure page',
      source: 'virtual: document.title',
   });

   const found = await runSrJson(['find', 'learn MORE']);
   expect(found.status).toBe(EXIT_SUCCESS);
   expect(found.result.details).toEqual({ text: 'learn MORE', found: true });
   expect(found.result.state.lastSpokenPhrase).toBe('link, Learn more');

   // The only match is the item under the cursor: the walk wraps back to it.
   const again = await runSrJson(['find', 'Learn more']);
   expect(again.status).toBe(EXIT_SUCCESS);
   expect(again.result.state.lastSpokenPhrase).toBe('link, Learn more');

   await assertFindMissing();
}

async function moveToFirstHeaderCell(): Promise<void> {
   await runSrJson(['next', 'table']);
   await runSrJson(['next', '--times', '4']);
   const header = await runSrJson(['read']);
   expect(header.result.state.lastSpokenPhrase).toBe('rowheader, Plan');
}

async function assertTableEdges(): Promise<void> {
   const seats = await runSrJson(['table', 'next-cell']);
   expect(seats.result.state.lastSpokenPhrase).toBe('cell, 1');
   const wrapped = await runSrJson(['table', 'next-cell']);
   expect(wrapped.result.state.lastSpokenPhrase).toBe('rowheader, Team');

   const edge = await runSrJson(['table', 'previous-row']);
   expect(edge.result.state.lastSpokenPhrase).toBe('rowheader, Starter');
   const beyond = await runSrJson(['table', 'previous-column']);
   expect(beyond.result.details).toEqual({ move: 'previous-column', moved: false });
}

async function assertTableMoves(): Promise<void> {
   const outside = await runCli(['sr', 'table', 'next-cell', '--json']);
   expectFirstErrorMessage({ result: outside, match: /not in a table cell/ });

   await moveToFirstHeaderCell();
   const price = await runSrJson(['table', 'next-column']);
   expect(price.result.state.lastSpokenPhrase).toBe('rowheader, Price');
   expect(price.result.details).toEqual({ move: 'next-column', moved: true });

   const starterPrice = await runSrJson(['table', 'next-row']);
   expect(starterPrice.result.state.lastSpokenPhrase).toBe('cell, 10');

   const columnHeader = await runSrJson(['table', 'column-header']);
   expect(columnHeader.result.details).toEqual({
      move: 'column-header',
      header: 'Price',
   });
   expect(columnHeader.result.state.lastSpokenPhrase).toBe('cell, 10');

   const rowHeader = await runSrJson(['table', 'row-header']);
   expect(rowHeader.result.details).toEqual({ move: 'row-header', header: 'Starter' });
   await assertTableEdges();
}

describe('cli sr title, find, and table', () => {
   it(
      'refuses a screenshot on the virtual target with the reason',
      withSession(assertScreenshotNeedsVoiceOver),
      TEST_TIMEOUT_LONG,
   );

   it(
      'reads the title and finds text, exiting 4 when the text is missing',
      withSession(assertTitleAndFind),
      TEST_TIMEOUT_LONG,
   );

   it(
      'moves between cells and reads headers',
      withSession(assertTableMoves),
      TEST_TIMEOUT_LONG,
   );
});
