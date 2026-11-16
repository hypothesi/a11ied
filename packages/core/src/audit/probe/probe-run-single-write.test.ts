import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { executeAuditAssessment } from '../assessment-command.js';
import { runAuditProbes } from './probe-run.js';
import type * as probeArtifacts from './probe-artifacts.js';

vi.mock('./probe-artifacts.js', async (importActual) => {
   const actual = await importActual<typeof probeArtifacts>();
   return {
      ...actual,
      writeProbeArtifacts: vi.fn(actual.writeProbeArtifacts),
   };
});

const PROBE_TIMEOUT_MS = 180_000;
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
      file,
      target: { kind: 'url', value: url },
      scope: 'page',
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

describe('runClaim single artifact write', () => {
   it(
      'calls writeProbeArtifacts only once per check',
      async () => {
         const module = await import('./probe-artifacts.js');
         const spy = vi.mocked(module.writeProbeArtifacts);
         const url = await startFixture();
         const file = await startRun(url);

         await runAuditProbes({ file, limit: 1 });

         expect(spy).toHaveBeenCalledTimes(1);
      },
      PROBE_TIMEOUT_MS,
   );
});
