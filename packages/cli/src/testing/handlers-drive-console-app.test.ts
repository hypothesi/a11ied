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

/*
 * The same end to end flow as console-app.test.ts, driven through `a1 sr` instead of the
 * TypeScript API, so a change that moves one and not the other shows up here.
 */
const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);
const startArgs = ['--sr', 'virtual', '--idle-timeout', '1'];
const EMAIL = 'dana@northwind.test';
const PASSWORD = 'correct horse';

interface DriveResult {
   state: { lastSpokenPhrase: string | null };
}

interface BatchResult {
   ran: number;
   failedExpectations: number;
   exitCode: number;
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

/** One JSON line per `a1 sr batch` step: fill the sign-in form and submit it. */
function signInLines(password: string): string {
   return [
      `{"action":"goto","payload":{"role":"textbox","name":"Work email"}}`,
      `{"action":"type","payload":{"text":"${EMAIL}"}}`,
      `{"action":"press","payload":{"keys":["Tab"]}}`,
      `{"action":"type","payload":{"text":"${password}"}}`,
      `{"action":"goto","payload":{"role":"button","name":"Sign in"}}`,
      `{"action":"checkpoint","payload":{"label":"submit"}}`,
      `{"action":"activate"}`,
   ].join('\n');
}

function onConsole(query: string, fn: () => Promise<void>): () => Promise<void> {
   return () =>
      withStateDir(tempRoots, async () => {
         const pageUrl = `${testServer.getBaseUrl()}/app/console.html${query}`;
         const started = await runCli(['sr', 'start', pageUrl, ...startArgs, '--json']);

         expect(started.status).toBe(EXIT_SUCCESS);
         try {
            await fn();
         } finally {
            await runCli(['sr', 'stop', '--json']);
         }
      });
}

async function signInWithBatch(password = PASSWORD): Promise<BatchResult> {
   const run = await runCli(['sr', 'batch', '--json'], signInLines(password));

   return parseJsonOutput(run.stdout).result as BatchResult;
}

async function assertRejectedSignInIsSilent(): Promise<void> {
   const batch = await signInWithBatch('the wrong one');

   expect(batch).toMatchObject({ failedExpectations: 0, exitCode: EXIT_SUCCESS });

   const stillHere = await runCli([
      'sr',
      'expect',
      '/do not match an account/i',
      '--since',
      'submit',
      '--json',
   ]);

   expect(stillHere.status).toBe(EXIT_ASSERTION);
   await runSrJson(['top']);
   expect(await phraseAfter(['next', 'heading'])).toBe('heading, Sign in, level 1');
}

async function assertTicketOpensWithoutAnnouncement(): Promise<void> {
   await signInWithBatch();
   await runSrJson(['top']);
   expect(await phraseAfter(['next', 'heading'])).toBe('heading, Ticket queue, level 1');

   await runSrJson(['goto', '--role', 'link', '--name', 'Seat count is wrong']);
   await runCli(['sr', 'checkpoint', 'open-ticket', '--json']);
   await runSrJson(['activate']);

   const title = await runCli(['sr', 'title', '--json']);

   expect(parseJsonOutput(title.stdout).result).toMatchObject({
      details: { title: 'Seat count is wrong | Support console' },
   });

   const routeSilent = await runCli([
      'sr',
      'expect',
      'Seat count is wrong',
      '--since',
      'open-ticket',
      '--json',
   ]);

   expect(routeSilent.status).toBe(EXIT_ASSERTION);
}

async function assertReplyIsAnnounced(): Promise<void> {
   await signInWithBatch();
   await runSrJson(['goto', '--role', 'link', '--name', 'Seat count is wrong']);
   await runSrJson(['activate']);

   await runSrJson(['goto', '--role', 'textbox', '--name', 'Message']);
   await runSrJson(['type', 'We corrected the seat count.']);
   await runSrJson(['goto', '--role', 'button', '--name', 'Send reply']);
   await runCli(['sr', 'checkpoint', 'send', '--json']);
   await runSrJson(['activate']);

   const announced = await runCli([
      'sr',
      'expect',
      'Reply sent. Status is now Waiting on customer.',
      '--since',
      'send',
      '--json',
   ]);

   expect(announced.status).toBe(EXIT_SUCCESS);
}

async function assertAnnouncedRouteChange(): Promise<void> {
   await signInWithBatch();

   const announced = await runCli([
      'sr',
      'expect',
      'Ticket queue view',
      '--since',
      'submit',
      '--json',
   ]);

   expect(announced.status).toBe(EXIT_SUCCESS);
}

describe('cli sr end to end through the console app', () => {
   it(
      'stays on the sign-in view and says nothing when the password is wrong',
      onConsole('', assertRejectedSignInIsSilent),
      TEST_TIMEOUT_LONG,
   );

   it(
      'signs in and opens a ticket without an announcement',
      onConsole('', assertTicketOpensWithoutAnnouncement),
      TEST_TIMEOUT_LONG,
   );

   it(
      'hears the reply confirmed from the status region',
      onConsole('', assertReplyIsAnnounced),
      TEST_TIMEOUT_LONG,
   );

   it(
      'hears the new view named when the app announces routes',
      onConsole('?announce=on', assertAnnouncedRouteChange),
      TEST_TIMEOUT_LONG,
   );
});
