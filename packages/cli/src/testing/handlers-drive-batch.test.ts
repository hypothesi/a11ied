import { writeFile } from 'node:fs/promises';
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

interface BatchStepShape {
   line: number;
   ok: boolean;
   outcome?: { action: string; phrase?: string };
   expectation?: { passed: boolean };
   error?: { code: string };
}

interface BatchShape {
   total: number;
   ran: number;
   failedExpectations: number;
   failedActions: number;
   exitCode: number;
   steps: BatchStepShape[];
}

const BATCH_LINES = [
   '# comments and blank lines are skipped',
   '{"action":"top"}',
   '',
   '{"action":"next","payload":{"kind":"heading"}}',
   '{"action":"expect","payload":{"match":"Structure page"}}',
   '{"action":"checkpoint","payload":{"label":"after-h1"}}',
   '{"action":"next","payload":{"kind":"link"}}',
   '{"action":"expect","payload":{"match":"nope"}}',
   '{"action":"next","payload":{"kind":"button"}}',
   '{"action":"expect","payload":{"match":"Create account","since":"after-h1"}}',
].join('\n');
const BATCH_LINE_COUNT = 8;
const FAILING_LINE = 6;
const STDIN_LINE_COUNT = 3;

function withSession(fn: (stateDir: string) => Promise<void>): () => Promise<void> {
   return () =>
      withStateDir(tempRoots, async (stateDir) => {
         const pageUrl = `${testServer.getBaseUrl()}/structure.html`;
         const started = await runCli(['sr', 'start', pageUrl, ...startArgs, '--json']);
         expect(started.status).toBe(EXIT_SUCCESS);
         try {
            await fn(stateDir);
         } finally {
            await runCli(['sr', 'stop', '--json']);
         }
      });
}

function parseBatch(stdout: string): BatchShape {
   return parseJsonOutput(stdout).result as BatchShape;
}

async function assertStopsAtFailedExpect(stateDir: string): Promise<void> {
   const file = resolve(stateDir, 'flow.jsonl');
   await writeFile(file, BATCH_LINES, 'utf8');

   const stopped = await runCli(['sr', 'batch', file, '--json']);
   expect(stopped.status).toBe(EXIT_ASSERTION);
   const batch = parseBatch(stopped.stdout);
   expect(batch).toMatchObject({
      total: BATCH_LINE_COUNT,
      ran: FAILING_LINE,
      failedExpectations: 1,
      failedActions: 0,
      exitCode: EXIT_ASSERTION,
   });
   expect(batch.steps.at(-1)).toMatchObject({
      ok: false,
      error: { code: 'expectation-failed' },
   });
   expect(batch.steps[1]?.outcome).toMatchObject({
      action: 'next',
      phrase: 'heading, Structure page, level 1',
   });

   const continued = await runCli(['sr', 'batch', file, '--continue', '--json']);
   expect(continued.status).toBe(EXIT_ASSERTION);
   expect(parseBatch(continued.stdout)).toMatchObject({
      ran: BATCH_LINE_COUNT,
      failedExpectations: 1,
   });

   const text = await runCli(['sr', 'batch', file, '--continue']);
   expect(text.stdout).toContain('expect Create account since "after-h1"  pass');
   expect(text.stdout).toContain('1 step failed, 8 of 8 ran.');
}

async function assertStdinAndBadLines(): Promise<void> {
   const passing = await runCli(
      ['sr', 'batch', '--json'],
      '{"action":"top"}\n{"action":"next","payload":{"kind":"table"}}\n{"action":"expect","payload":{"match":"Plans"}}\n',
   );
   expect(passing.status).toBe(EXIT_SUCCESS);
   expect(parseBatch(passing.stdout)).toMatchObject({
      ran: STDIN_LINE_COUNT,
      exitCode: EXIT_SUCCESS,
   });

   const badShape = await runCli(
      ['sr', 'batch', '--json'],
      '{"action":"press","payload":{"key":"Tab"}}\n',
   );
   expect(badShape.status).toBe(EXIT_USAGE);
   expectFirstErrorMessage({
      result: badShape,
      match: /Line 1 is not a driver action: payload\.keys/,
   });

   const badJson = await runCli(
      ['sr', 'batch', '--json'],
      '{"action":"next"}\nnot json\n',
   );
   expectFirstErrorMessage({ result: badJson, match: /Line 2 is not JSON/ });

   const empty = await runCli(['sr', 'batch', '--json'], '# nothing here\n');
   expectFirstErrorMessage({ result: empty, match: /The batch has no actions/ });
}

describe('cli sr batch', () => {
   it(
      'runs a file over one connection and stops at the first failed expect',
      withSession(assertStopsAtFailedExpect),
      TEST_TIMEOUT_LONG,
   );

   it(
      'reads stdin and rejects lines that are not actions',
      withSession(assertStdinAndBadLines),
      TEST_TIMEOUT_LONG,
   );
});
