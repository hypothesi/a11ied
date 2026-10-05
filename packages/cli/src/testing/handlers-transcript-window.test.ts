import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
   cliOutputEnvelopeSchema,
   driverTranscriptSchema,
   type DriverTranscript,
} from '@a11ied/contracts';

import {
   EXIT_SUCCESS,
   parseJsonOutput,
   runCli,
   TEST_TIMEOUT_LONG,
   useTestServer,
   withStateDir,
} from './setup.js';

const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);

async function startTranscriptFixture(): Promise<void> {
   await runCli([
      'sr',
      'start',
      `${testServer.getBaseUrl()}/basic-page.html`,
      '--sr',
      'virtual',
      '--json',
   ]);
   await runCli(['sr', 'checkpoint', 'tested', '--json']);
   await runCli(['sr', 'next', '--json']);
   await runCli(['sr', 'next', '--json']);
}

async function getTranscriptPage(
   args: string[],
): Promise<{ status: number; transcript: DriverTranscript }> {
   const result = await runCli(args);
   return {
      status: result.status,
      transcript: driverTranscriptSchema.parse(
         cliOutputEnvelopeSchema.parse(parseJsonOutput(result.stdout)).result?.transcript,
      ),
   };
}

async function assertTranscriptPage(stateDir: string): Promise<void> {
   const outPath = join(stateDir, 'transcript.json');
   await startTranscriptFixture();
   const first = await getTranscriptPage([
      'sr',
      'transcript',
      '--since',
      'tested',
      '--limit',
      '1',
      '--out',
      outPath,
      '--json',
   ]);
   const second = await getTranscriptPage([
      'sr',
      'transcript',
      '--after-index',
      String(first.transcript.window?.nextAfterIndex),
      '--limit',
      '1',
      '--json',
   ]);
   const written = driverTranscriptSchema.parse(
      JSON.parse(await readFile(outPath, 'utf8')),
   );

   expect(first.status).toStrictEqual(EXIT_SUCCESS);
   expect(second.status).toStrictEqual(EXIT_SUCCESS);
   expect(first.transcript.entries).toHaveLength(1);
   expect(first.transcript.window).toMatchObject({
      returnedEntries: 1,
      complete: false,
      hasMore: true,
   });
   expect(written).to.eql(first.transcript);
   expect(second.transcript.entries).toHaveLength(1);
   expect(second.transcript.entries[0]?.index).toStrictEqual(
      (first.transcript.entries[0]?.index ?? -1) + 1,
   );
}

describe('CLI transcript pagination', () => {
   it(
      'selects at the broker and exports page disclosure',
      async () => {
         await withStateDir(tempRoots, async (stateDir) => {
            try {
               await assertTranscriptPage(stateDir);
            } finally {
               await runCli(['sr', 'stop', '--json']);
            }
         });
      },
      TEST_TIMEOUT_LONG,
   );
});
