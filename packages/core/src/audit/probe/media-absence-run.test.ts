import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { evidenceRecordSchema } from '@a11ied/contracts';
import { executeAuditAssessment } from '../assessment-command.js';
import { readAuditRun } from '../run-store.js';
import { runAuditProbes } from './probe-run.js';

const MEDIA_TEST_TIMEOUT_MS = 120_000;
const fixture: { root?: string; server?: Server } = {};

afterEach(async () => {
   const { server, root } = fixture;
   if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
         server.close(() => resolve());
      });
   }
   if (root) {
      await rm(root, { recursive: true, force: true });
   }
});

async function startMediaServer(body: string): Promise<string> {
   const server = createServer((_request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(
         `<!doctype html><html lang="en"><title>Fixture</title><main><h1>Fixture</h1>${body}</main></html>`,
      );
   });
   fixture.server = server;
   await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
   });
   const address = server.address();
   if (!address || typeof address === 'string') {
      throw new Error('Missing server address.');
   }
   return `http://127.0.0.1:${String(address.port)}/`;
}

async function startMediaRun(body: string): Promise<string> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-media-run-'));
   fixture.root = root;
   const file = join(root, 'run.json');
   const target = { kind: 'url' as const, value: await startMediaServer(body) };
   await executeAuditAssessment({
      action: 'start',
      file,
      target,
      scope: 'page',
      environment: {
         environmentId: 'browser',
         platform: 'virtual',
         os: 'fixture',
         capabilities: ['rendered-ui', 'dom', 'keyboard'],
         limitations: ['No audio capability.'],
      },
   });
   await executeAuditAssessment({
      action: 'state',
      file,
      state: {
         stateId: 'initial',
         target,
         label: 'Initial',
         fingerprint: 'initial',
         environmentId: 'browser',
      },
   });
   return file;
}

async function assertAbsenceRecord(file: string): Promise<void> {
   const contents = await readFile(join(file, '..', 'evidence.jsonl'), 'utf8');
   const record = evidenceRecordSchema.parse(JSON.parse(contents.trim()));

   expect(record.outcome).toBe('inapplicable');
   expect(record.verification?.status).toBe('verified');
}

describe('media applicability without audio capability', () => {
   it(
      'records audio-control absence without inventing reader speech',
      async () => {
         const file = await startMediaRun('<p>Text content</p>');
         await runAuditProbes({ file, limit: 4 });
         const contents = await readFile(join(file, '..', 'evidence.jsonl'), 'utf8');
         const records = contents
            .trim()
            .split('\n')
            .map((line) => evidenceRecordSchema.parse(JSON.parse(line)));
         const control = records.find(
            (record) =>
               record.test.kind === 'criterion' && record.test.criterionId === '1.4.2',
         );

         expect(control?.outcome).toBe('inapplicable');
         expect(control?.verification?.status).toBe('verified');
         expect(
            control?.provenance?.artifacts.some((artifact) => artifact.kind === 'speech'),
         ).toStrictEqual(false);
      },
      MEDIA_TEST_TIMEOUT_MS,
   );

   it.each([
      { body: '<p>Text content</p>', name: 'absent', assessed: 1, status: 'evaluated' },
      {
         body: '<video controls></video>',
         name: 'present',
         assessed: 0,
         status: 'blocked',
      },
   ])(
      'keeps $name media correctly scoped',
      async ({ body, assessed, status }) => {
         const file = await startMediaRun(body);
         await runAuditProbes({ file, limit: 1 });
         const run = await readAuditRun(file);
         const check = run.checks.find((entry) => entry.criterionId === '1.2.1');
         const current = await executeAuditAssessment({ action: 'status', file });

         expect(check?.status).toBe(status);
         expect(current.coverage.assessed).toBe(assessed);
         if (assessed > 0) {
            await assertAbsenceRecord(file);
         } else {
            expect(check?.reason).toContain('audio');
         }
      },
      MEDIA_TEST_TIMEOUT_MS,
   );
});
