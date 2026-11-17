import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
   type TestServerHandle,
   createTestServer,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   EXIT_USAGE,
   TEST_TIMEOUT_VERY_LONG,
} from './setup.js';

const testServer: TestServerHandle = createTestServer();
const root = mkdtempSync(join(tmpdir(), 'a11ied-audit-cli-'));

interface Packet {
   unit: { id: string; criteria: string[] };
   knownFindings: Array<{ id: string; criterion: string; locationHere?: string }>;
   signals: Record<string, unknown>;
}

beforeAll(async () => {
   vi.stubEnv('A11IED_AUDITS_DIR', root);
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
   vi.unstubAllEnvs();
   rmSync(root, { recursive: true, force: true });
});

async function audit(...args: string[]): Promise<Record<string, unknown>> {
   const result = await runCli(['audit', ...args, '--json']);
   expect(result.status, result.stderr).toBe(EXIT_SUCCESS);
   const { result: payload } = parseJsonOutput(result.stdout);
   return payload as Record<string, unknown>;
}

function writeSubmission(packet: Packet, name: string): string {
   const file = join(root, `${name}.json`);
   const failing = new Set(
      packet.knownFindings
         .filter((finding) => finding.locationHere !== undefined)
         .map((finding) => finding.criterion),
   );
   writeFileSync(
      file,
      JSON.stringify({
         results: packet.unit.criteria.map((criterion) => ({
            criterion,
            outcome: failing.has(criterion) ? 'fail' : 'pass',
            note: 'Checked on the fixture page.',
         })),
         summary: 'Fixture unit.',
      }),
   );
   return file;
}

describe('a1 audit, start to report', () => {
   it(
      'scans a page, hands out a unit with signals, accepts it, and reports',
      async () => {
         const page = `${testServer.getBaseUrl()}/button-name-failure.html`;
         await audit('init', page, '--id', 'e2e', '--page', '--criteria', '4.1.2,2.4.7');
         const scan = await audit('scan', '--audit', 'e2e');
         const next = await audit(
            'next',
            '--audit',
            'e2e',
            '--worker',
            'w1',
            '--pass',
            'semantics',
         );
         const packet = next['packet'] as Packet;
         const submitted = await audit(
            'submit',
            packet.unit.id,
            '--audit',
            'e2e',
            '--worker',
            'w1',
            '--file',
            writeSubmission(packet, 'semantics'),
         );
         const report = await audit('report', '--audit', 'e2e');
         const html =
            (report['files'] as string[]).find((file) => file.endsWith('.html')) ?? '';

         expect(scan['pages']).toEqual([
            expect.objectContaining({ pageId: 'P1', ok: true, findings: 1 }),
         ]);
         expect(packet.unit.id).toBe('P1.semantics');
         expect(packet.knownFindings[0]?.criterion).toBe('4.1.2');
         expect(packet.signals).toHaveProperty('axe');
         expect(submitted['units']).toMatchObject({ done: 1, total: 2 });
         expect(report).toMatchObject({ final: false, verdict: 'fails', findings: 1 });
         expect(readFileSync(html, 'utf8')).toContain(
            'Buttons must have discernible text',
         );
      },
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'rejects an incomplete submission and names every problem',
      async () => {
         const file = join(root, 'bad.json');
         writeFileSync(file, JSON.stringify({ results: [] }));
         await audit('next', '--audit', 'e2e', '--worker', 'w2');

         const result = await runCli([
            'audit',
            'submit',
            'P1.keyboard',
            '--audit',
            'e2e',
            '--worker',
            'w2',
            '--file',
            file,
         ]);

         expect(result.status).toBe(EXIT_USAGE);
         expect(result.stderr).toContain('submission-rejected');
         expect(result.stderr).toContain('2.4.7 has no outcome');
      },
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'tells a worker to stop when no unit is left for it',
      async () => {
         const result = await runCli([
            'audit',
            'next',
            '--audit',
            'e2e',
            '--worker',
            'w3',
         ]);

         expect(result.status).toBe(EXIT_SUCCESS);
         expect(result.stdout).toContain('held by other workers');
      },
      TEST_TIMEOUT_VERY_LONG,
   );
});

describe('a1 audit with parallel workers', () => {
   it(
      'gives every simultaneous worker a different unit',
      async () => {
         const workers = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
         await audit(
            'init',
            'https://example.test',
            '--id',
            'parallel',
            '--criteria',
            '2.4.7',
         );
         for (const path of workers) {
            // oxlint-disable-next-line no-await-in-loop -- pages are numbered in the order added
            await audit(
               'page',
               'add',
               `https://example.test/${path}`,
               '--audit',
               'parallel',
            );
         }

         const claims = await Promise.all(
            workers.map((worker) =>
               audit('next', '--audit', 'parallel', '--worker', worker),
            ),
         );
         const units = claims.map((claim) => (claim['packet'] as Packet).unit.id);

         expect(new Set(units).size).toBe(workers.length);
      },
      TEST_TIMEOUT_VERY_LONG,
   );
});
