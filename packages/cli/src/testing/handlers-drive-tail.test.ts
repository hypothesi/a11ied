import { describe, expect, it } from 'vitest';

import {
   withStateDir,
   runCli,
   parseJsonOutput,
   EXIT_USAGE,
   EXIT_SUCCESS,
   TEST_TIMEOUT_LONG,
   useTestServer,
} from './setup.js';
import { executeTailAction } from '../commands/drive-tail.js';

const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);
const startArgs = ['--sr', 'virtual', '--idle-timeout', '1'];

async function captureOutput(fn: () => Promise<void>): Promise<string> {
   const written: string[] = [];
   const originalWrite = process.stdout.write.bind(process.stdout);
   process.stdout.write = (chunk: string | Uint8Array): boolean => {
      written.push(String(chunk));
      return true;
   };
   try {
      await fn();
   } finally {
      process.stdout.write = originalWrite;
   }
   return written.join('');
}

function withSession(fn: () => Promise<void>): () => Promise<void> {
   return () =>
      withStateDir(tempRoots, async () => {
         const url = `${testServer.getBaseUrl()}/basic-page.html`;
         const started = await runCli(['sr', 'start', url, ...startArgs, '--json']);
         expect(started.status).toBe(EXIT_SUCCESS);
         try {
            await fn();
         } finally {
            await runCli(['sr', 'stop', '--json']);
         }
      });
}

async function assertNoSession(): Promise<void> {
   const run = await runCli(['sr', 'tail']);

   expect(run.status).toBe(EXIT_USAGE);
   expect(run.stderr).toContain('missing-session');
   expect(run.stderr).toContain('No active screen reader session');
}

async function assertNoSessionJson(): Promise<void> {
   const run = await runCli(['sr', 'tail', '--json']);

   expect(run.status).toBe(EXIT_USAGE);
   const json = parseJsonOutput(run.stdout);
   expect(json).toMatchObject({
      ok: false,
      errors: [{ code: 'missing-session' }],
   });
}

async function assertAliasesNoSession(): Promise<void> {
   const aliases = ['follow', 'stream', 'watch'] as const;
   const runs = await Promise.all(
      aliases.map((alias) => runCli(['sr', alias, '--json'])),
   );

   for (const run of runs) {
      expect(run.status).toBe(EXIT_USAGE);
      const json = parseJsonOutput(run.stdout);
      expect(json).toMatchObject({
         ok: false,
         errors: [{ code: 'missing-session' }],
      });
   }
}

async function assertStreamText(): Promise<void> {
   await runCli(['sr', 'next']);
   await runCli(['sr', 'checkpoint', 'midway']);
   await runCli(['sr', 'next']);

   const output = await captureOutput(() =>
      executeTailAction({
         lines: '5',
         stopAfterCount: 3,
      }),
   );

   expect(output).toContain('document');
   expect(output.length).toBeGreaterThan(0);
}

async function assertStreamJson(): Promise<void> {
   await runCli(['sr', 'next']);

   const output = await captureOutput(() =>
      executeTailAction({
         json: true,
         stopAfterCount: 2,
      }),
   );

   const parsedLines = output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

   expect(parsedLines.length).toBeGreaterThanOrEqual(1);
   expect(parsedLines[0]).toHaveProperty('phrase');
   expect(parsedLines[0]).toHaveProperty('index');
}

async function assertStreamPhrase(): Promise<void> {
   await runCli(['sr', 'next']);

   const raw = await captureOutput(() =>
      executeTailAction({
         phrase: true,
         stopAfterCount: 1,
      }),
   );
   const output = raw.trim();

   expect(output).not.toContain('[');
   expect(output).not.toContain(']');
   expect(output.length).toBeGreaterThan(0);
}

describe('cli sr tail subcommand', () => {
   it('fails with missing-session error when no session is active', () =>
      withStateDir(tempRoots, assertNoSession));

   it('returns a missing-session JSON envelope when --json is passed without a session', () =>
      withStateDir(tempRoots, assertNoSessionJson));

   it('supports aliases follow, stream, and watch when no session is active', () =>
      withStateDir(tempRoots, assertAliasesNoSession));

   it(
      'streams announcements programmatically from an active session',
      withSession(assertStreamText),
      TEST_TIMEOUT_LONG,
   );

   it(
      'streams NDJSON lines when --json is provided',
      withSession(assertStreamJson),
      TEST_TIMEOUT_LONG,
   );

   it(
      'streams only phrase text when --phrase is provided',
      withSession(assertStreamPhrase),
      TEST_TIMEOUT_LONG,
   );
});
