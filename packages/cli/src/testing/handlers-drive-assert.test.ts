import { describe, expect, it } from 'vitest';

import {
   withStateDir,
   runCli,
   parseJsonOutput,
   EXIT_ASSERTION,
   EXIT_SUCCESS,
   TEST_TIMEOUT_LONG,
   useTestServer,
   type CliResult,
} from './setup.js';

const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);
const startArgs = ['--sr', 'virtual', '--allow-virtual', '--idle-timeout', '1'];
const WAIT_PAUSE_MS = 120;
const WAIT_SHORT_TIMEOUT_MS = 300;
const WAIT_LONG_TIMEOUT_MS = 8000;
const CONCURRENT_START_DELAY_MS = 400;

interface ExpectationShape {
   passed: boolean;
   matched: boolean;
   checked: number;
   entry?: { phrase: string };
}

interface WaitDetails {
   matched?: boolean;
   waitedMs?: number;
   pausedMs?: number;
   phrase?: string;
}

function parseExpectation(run: CliResult): {
   status: number;
   expectation: ExpectationShape;
   errors: Array<{ code: string }>;
} {
   const json = parseJsonOutput(run.stdout);
   return {
      status: run.status,
      expectation: (json.result as { expectation: ExpectationShape }).expectation,
      errors: json.errors as Array<{ code: string }>,
   };
}

function parseWait(run: CliResult): {
   status: number;
   details: WaitDetails;
   errors: Array<{ code: string }>;
} {
   const json = parseJsonOutput(run.stdout);
   return {
      status: run.status,
      details: (json.result as { details: WaitDetails }).details,
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

async function assertExpectSince(): Promise<void> {
   await runCli(['sr', 'checkpoint', 'after-heading', '--json']);
   await runCli(['sr', 'next', 'link', '--json']);
   const since = parseExpectation(
      await runCli([
         'sr',
         'expect',
         'Structure page',
         '--since',
         'after-heading',
         '--json',
      ]),
   );
   expect(since.status).toBe(EXIT_ASSERTION);
   expect(since.expectation.checked).toBe(1);

   const text = await runCli(['sr', 'expect', 'About us', '--since', 'after-heading']);
   expect(text.status).toBe(EXIT_SUCCESS);
   expect(text.stdout).toContain('Result:');
   expect(text.stdout).toContain('pass');
}

async function assertExpect(): Promise<void> {
   await runCli(['sr', 'next', 'heading', '--json']);
   const passed = parseExpectation(
      await runCli(['sr', 'expect', 'structure PAGE', '--json']),
   );
   expect(passed.status).toBe(EXIT_SUCCESS);
   expect(passed.expectation).toMatchObject({ passed: true, matched: true });
   expect(passed.expectation.entry?.phrase).toBe('heading, Structure page, level 1');

   const regex = parseExpectation(
      await runCli([
         'sr',
         'expect',
         String.raw`/^heading, \w+ page, level 1$/`,
         '--json',
      ]),
   );
   expect(regex.status).toBe(EXIT_SUCCESS);

   const missing = parseExpectation(await runCli(['sr', 'expect', 'nope', '--json']));
   expect(missing.status).toBe(EXIT_ASSERTION);
   expect(missing.errors[0]?.code).toBe('expectation-failed');
   expect(missing.expectation).toMatchObject({ passed: false, matched: false });

   const inverted = parseExpectation(
      await runCli(['sr', 'expect', 'nope', '--not', '--json']),
   );
   expect(inverted.status).toBe(EXIT_SUCCESS);

   await assertExpectSince();
}

async function assertWaitPauseAndTimeout(): Promise<void> {
   const paused = parseWait(
      await runCli(['sr', 'wait', '--ms', String(WAIT_PAUSE_MS), '--json']),
   );
   expect(paused.status).toBe(EXIT_SUCCESS);
   expect(paused.details.pausedMs).toBe(WAIT_PAUSE_MS);
   expect(paused.details.waitedMs).toBeGreaterThanOrEqual(WAIT_PAUSE_MS);

   const timedOut = parseWait(
      await runCli([
         'sr',
         'wait',
         '--for',
         'nope',
         '--timeout',
         String(WAIT_SHORT_TIMEOUT_MS),
         '--json',
      ]),
   );
   expect(timedOut.status).toBe(EXIT_ASSERTION);
   expect(timedOut.errors[0]?.code).toBe('phrase-not-announced');
   expect(timedOut.details).toMatchObject({ matched: false });
   expect(timedOut.details.waitedMs).toBeGreaterThanOrEqual(WAIT_SHORT_TIMEOUT_MS);
}

/**
 * The phrase arrives while wait is polling, produced by another process. That is the case
 * wait exists for: an announcement between two commands is still caught.
 */
async function assertWaitCatchesAPhraseFromAnotherProcess(): Promise<void> {
   const waiting = runCli([
      'sr',
      'wait',
      '--for',
      '/^heading, Products/',
      '--timeout',
      String(WAIT_LONG_TIMEOUT_MS),
      '--json',
   ]);
   await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, CONCURRENT_START_DELAY_MS);
   });
   await runCli(['sr', 'next', 'heading', '--json']);
   await runCli(['sr', 'next', 'heading', '--json']);
   const caught = parseWait(await waiting);
   expect(caught.status).toBe(EXIT_SUCCESS);
   expect(caught.details).toMatchObject({
      matched: true,
      phrase: 'heading, Products, level 2',
   });
}

describe('cli sr expect and wait', () => {
   it(
      'checks the transcript with text, regex, --since, and --not',
      withSession(assertExpect),
      TEST_TIMEOUT_LONG,
   );

   it(
      'pauses with --ms and exits 4 when --for times out',
      withSession(assertWaitPauseAndTimeout),
      TEST_TIMEOUT_LONG,
   );

   it(
      'catches a phrase that another process produces while it polls',
      withSession(assertWaitCatchesAPhraseFromAnotherProcess),
      TEST_TIMEOUT_LONG,
   );
});
