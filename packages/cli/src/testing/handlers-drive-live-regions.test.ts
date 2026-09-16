import { describe, expect, it } from 'vitest';

import {
   EXIT_ASSERTION,
   EXIT_SUCCESS,
   TEST_TIMEOUT_LONG,
   parseJsonOutput,
   runCli,
   useTestServer,
   withStateDir,
} from './setup.js';

const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);
const startArgs = ['--sr', 'virtual', '--idle-timeout', '1'];
const SHORT_TIMEOUT_MS = '1500';
const WAIT_TIMEOUT_MS = '5000';

interface DriveResult {
   state: { lastSpokenPhrase: string | null };
   expectation?: { passed: boolean; matched: boolean; entry?: { phrase: string } };
}

async function runSrJson(
   args: string[],
): Promise<{ status: number; result: DriveResult }> {
   const run = await runCli(['sr', ...args, '--json']);

   return {
      status: run.status,
      result: parseJsonOutput(run.stdout).result as DriveResult,
   };
}

async function phraseAfter(args: string[]): Promise<string> {
   const { status, result } = await runSrJson(args);

   expect(status, args.join(' ')).toBe(EXIT_SUCCESS);
   return result.state.lastSpokenPhrase ?? '';
}

async function transcriptSince(label: string): Promise<string[]> {
   const run = await runCli(['sr', 'transcript', '--since', label, '--json']);

   expect(run.status).toBe(EXIT_SUCCESS);
   const result = parseJsonOutput(run.stdout).result as {
      transcript: { entries: Array<{ phrase: string }> };
   };

   return result.transcript.entries.map((entry) => entry.phrase);
}

function onFixture(fixture: string, fn: () => Promise<void>): () => Promise<void> {
   return () =>
      withStateDir(tempRoots, async () => {
         const pageUrl = `${testServer.getBaseUrl()}/${fixture}`;
         const started = await runCli(['sr', 'start', pageUrl, ...startArgs, '--json']);

         expect(started.status).toBe(EXIT_SUCCESS);
         try {
            await fn();
         } finally {
            await runCli(['sr', 'stop', '--json']);
         }
      });
}

async function assertPoliteRegionIsWaitedFor(): Promise<void> {
   await runSrJson(['goto', '--role', 'button', '--name', 'Save draft']);
   await runSrJson(['activate']);

   const waited = await runCli([
      'sr',
      'wait',
      '--for',
      '/draft saved/i',
      '--timeout',
      WAIT_TIMEOUT_MS,
      '--json',
   ]);

   expect(waited.status).toBe(EXIT_SUCCESS);
   expect(
      (parseJsonOutput(waited.stdout).result as DriveResult).state.lastSpokenPhrase,
   ).toBe('polite: Draft saved to your workspace.');
}

async function assertAssertiveRegionIsAlreadySpoken(): Promise<void> {
   await runSrJson(['goto', '--role', 'button', '--name', 'Delete account']);
   await runCli(['sr', 'checkpoint', 'delete', '--json']);
   await runSrJson(['activate']);

   const checked = await runSrJson([
      'expect',
      '/deletion could not/i',
      '--since',
      'delete',
   ]);

   expect(checked.status).toBe(EXIT_SUCCESS);
   expect(checked.result.expectation?.entry?.phrase).toBe(
      'assertive: Account deletion could not be started.',
   );

   /*
    * `wait` polls for phrases spoken after the call, and role="alert" announces during
    * the click, so the phrase is already in the transcript by the time it starts.
    */
   const late = await runCli([
      'sr',
      'wait',
      '--for',
      '/deletion/i',
      '--timeout',
      SHORT_TIMEOUT_MS,
      '--json',
   ]);

   expect(late.status).toBe(EXIT_ASSERTION);
}

async function assertPlainContainerIsSilent(): Promise<void> {
   await runSrJson(['goto', '--role', 'button', '--name', 'Archive report']);
   await runCli(['sr', 'checkpoint', 'archive', '--json']);
   await runSrJson(['activate']);

   expect(await transcriptSince('archive')).toEqual([]);

   const missed = await runCli([
      'sr',
      'expect',
      'Report archived',
      '--since',
      'archive',
      '--json',
   ]);

   expect(missed.status).toBe(EXIT_ASSERTION);
}

async function assertDialogsDifferOnFocus(): Promise<void> {
   await runSrJson(['goto', '--role', 'button', '--name', 'Rename workspace']);
   expect(await phraseAfter(['activate'])).toBe('button, Rename workspace');
   expect(await phraseAfter(['press', 'Tab'])).toBe('button, Transfer workspace');

   await runCli([
      'sr',
      'open',
      `${testServer.getBaseUrl()}/modal-untrapped.html`,
      '--json',
   ]);
   await runSrJson(['goto', '--role', 'button', '--name', 'Transfer workspace']);
   expect(await phraseAfter(['activate'])).toBe('textbox, New owner');
   expect(await phraseAfter(['press', 'Tab'])).toBe('button, Cancel');
}

describe('cli sr against live regions and dialogs', () => {
   it(
      'waits for a polite region that fills in after the click',
      onFixture('live-regions.html', assertPoliteRegionIsWaitedFor),
      TEST_TIMEOUT_LONG,
   );

   it(
      'finds an assertive region in the transcript and exits 4 waiting for it',
      onFixture('live-regions.html', assertAssertiveRegionIsAlreadySpoken),
      TEST_TIMEOUT_LONG,
   );

   it(
      'exits 4 on a message written to a container with no role',
      onFixture('live-regions.html', assertPlainContainerIsSilent),
      TEST_TIMEOUT_LONG,
   );

   it(
      'shows which dialog moves the cursor into itself',
      onFixture('modal-untrapped.html', assertDialogsDifferOnFocus),
      TEST_TIMEOUT_LONG,
   );
});
