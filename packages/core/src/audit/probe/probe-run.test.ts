import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { evidenceRecordSchema } from '@a11ied/contracts';
import { executeAuditAssessment } from '../assessment-command.js';
import { runAuditProbes } from './probe-run.js';

const PROBE_TIMEOUT_MS = 180_000;
const PROBED_CHECKS = 3;
const PAGE =
   '<!doctype html><html lang="en"><head><title>Probe fixture</title></head><body><main><h1>Fixture</h1><p>Plain text.</p></main></body></html>';

const fixture: { server?: Server; directory?: string } = {};

afterEach(async () => {
   fixture.server?.close();
   if (fixture.directory) {
      await rm(fixture.directory, { recursive: true, force: true });
   }
});

async function startFixture(): Promise<string> {
   const server = createServer((_request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(PAGE);
   });
   fixture.server = server;
   await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
   });
   const address = server.address();
   if (typeof address !== 'object' || address === null) {
      throw new Error('The fixture server has no port.');
   }
   return `http://127.0.0.1:${String(address.port)}/`;
}

async function startRun(url: string): Promise<string> {
   const directory = await mkdtemp(join(tmpdir(), 'a11ied-probe-'));
   fixture.directory = directory;
   const file = join(directory, 'run.json');
   await executeAuditAssessment({
      action: 'start',
      target: { kind: 'url', value: url },
      scope: 'page',
      file,
      environment: {
         environmentId: 'browser',
         platform: 'virtual',
         os: 'fixture',
         browser: 'Chrome',
         capabilities: [
            'rendered-ui',
            'dom',
            'keyboard',
            'screenshot',
            'viewport',
            'measurement',
         ],
         limitations: ['Fixture environment without a screen reader.'],
      },
   });
   await executeAuditAssessment({
      action: 'state',
      file,
      state: {
         stateId: 'fixture',
         target: { kind: 'url', value: url },
         label: 'Fixture page',
         fingerprint: 'fixture-initial',
         environmentId: 'browser',
      },
   });
   return file;
}

describe('runAuditProbes', () => {
   it(
      'records verified evidence for each check a browser can decide',
      async () => {
         const url = await startFixture();
         const file = await startRun(url);

         const result = await runAuditProbes({ file, limit: PROBED_CHECKS });
         const raw = await readFile(join(file, '..', 'evidence.jsonl'), 'utf8');
         const lines = raw
            .trim()
            .split('\n')
            .map((line) => evidenceRecordSchema.parse(JSON.parse(line)));

         expect(result.attempted).toStrictEqual(PROBED_CHECKS);
         expect(lines).toHaveLength(PROBED_CHECKS);
         expect(
            lines.every((line) => line.verification?.status === 'verified'),
         ).toStrictEqual(true);
      },
      PROBE_TIMEOUT_MS,
   );

   it(
      'stops at the limit and leaves the rest of the queue claimable',
      async () => {
         const file = await startRun(await startFixture());

         await runAuditProbes({ file, limit: 1 });
         const status = await executeAuditAssessment({ action: 'status', file });

         expect(status.coverage.assessed).toStrictEqual(1);
      },
      PROBE_TIMEOUT_MS,
   );
});
