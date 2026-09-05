import { describe, expect, it } from 'vitest';
import { withStateDir } from '../../cli/src/testing/fixtures.js';

import {
   getInvalidContentText,
   ONE_MINUTE_MS,
   startVirtualSession,
   withHarness,
} from './testing/harness.js';

const CLI_EXIT_ASSERTION = 4;
const tempRoots: string[] = [];

describe('sr_list tool', () => {
   it('lists named commands, matching a1 sr list', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'sr_list',
            arguments: { query: 'heading' },
         });

         expect(result.isError).toBeFalsy();
         const payload = result.structuredContent as {
            commandSets: Array<{ commands: unknown[] }>;
         };
         expect(payload.commandSets.length).toBeGreaterThan(0);
      });
   });
});

describe('sr_session and sr_action tools', () => {
   it(
      'runs actions against the one active session without a session id',
      async () => {
         await withStateDir(tempRoots, async () => {
            await withHarness(async (harness) => {
               const session = await startVirtualSession(harness.client);
               expect(session.sessionId).toMatch(/^drv_/);

               const moved = await harness.client.callTool({
                  name: 'sr_action',
                  arguments: { action: 'next' },
               });
               expect(moved.isError).toBeFalsy();

               const pressed = await harness.client.callTool({
                  name: 'sr_action',
                  arguments: { action: 'press', payload: { keys: ['Tab', 'Tab'] } },
               });
               expect(pressed.isError).toBeFalsy();

               const stop = await harness.client.callTool({
                  name: 'sr_session',
                  arguments: { action: 'stop' },
               });
               expect(stop.isError).toBeFalsy();

               const orphaned = await harness.client.callTool({
                  name: 'sr_action',
                  arguments: { action: 'next' },
               });
               expect(orphaned.isError).toBe(true);
               expect(getInvalidContentText(orphaned.content)).toContain(
                  'No active screen reader session',
               );
            });
         });
      },
      ONE_MINUTE_MS,
   );
});

describe('sr_action goto verdict', () => {
   it(
      'attaches exitCode 4 to a goto action that finds nothing, like a1 sr goto',
      async () => {
         await withStateDir(tempRoots, async () => {
            await withHarness(async (harness) => {
               await startVirtualSession(harness.client);

               const goto = await harness.client.callTool({
                  name: 'sr_action',
                  arguments: {
                     action: 'goto',
                     payload: { role: 'button', name: 'does-not-exist', max: 5 },
                  },
               });

               expect(goto.isError).toBeFalsy();
               const payload = goto.structuredContent as { exitCode: number };
               expect(payload.exitCode).toBe(CLI_EXIT_ASSERTION);

               await harness.client.callTool({
                  name: 'sr_session',
                  arguments: { action: 'stop' },
               });
            });
         });
      },
      ONE_MINUTE_MS,
   );
});

describe('sr_expect and sr_transcript tools', () => {
   it(
      'checks an announced phrase and prints the transcript, matching a1 sr expect/transcript',
      async () => {
         await withStateDir(tempRoots, async () => {
            await withHarness(async (harness) => {
               await startVirtualSession(harness.client);
               await harness.client.callTool({
                  name: 'sr_action',
                  arguments: { action: 'checkpoint', payload: { label: 'start' } },
               });
               await harness.client.callTool({
                  name: 'sr_action',
                  arguments: { action: 'next' },
               });

               const expectMissing = await harness.client.callTool({
                  name: 'sr_expect',
                  arguments: { pattern: 'this phrase was never announced' },
               });
               expect(expectMissing.isError).toBeFalsy();
               const missingPayload = expectMissing.structuredContent as {
                  exitCode: number;
                  expectation: { passed: boolean };
               };
               expect(missingPayload.expectation.passed).toBe(false);
               expect(missingPayload.exitCode).toBe(CLI_EXIT_ASSERTION);

               const transcript = await harness.client.callTool({
                  name: 'sr_transcript',
                  arguments: { since: 'start' },
               });
               expect(transcript.isError).toBeFalsy();
               const transcriptPayload = transcript.structuredContent as {
                  transcript: { entries: unknown[] };
               };
               expect(transcriptPayload.transcript.entries.length).toBeGreaterThan(0);

               await harness.client.callTool({
                  name: 'sr_session',
                  arguments: { action: 'stop' },
               });
            });
         });
      },
      ONE_MINUTE_MS,
   );
});
