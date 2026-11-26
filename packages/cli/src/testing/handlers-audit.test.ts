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
   knownFindings: {
      id: string;
      criterion: string;
      here: boolean;
      needsDescription: boolean;
   }[];
   signals: Record<string, unknown>;
   stateIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
   if (!isRecord(value)) {
      throw new TypeError(`Expected an object, got ${JSON.stringify(value)}`);
   }
   return value;
}

function readStrings(value: unknown): string[] {
   return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
}

/** Reads the parts of a work packet these tests use, failing loudly on a wrong shape. */
function readPacket(value: unknown): Packet {
   const packet = readRecord(value);
   const unit = readRecord(packet['unit']);
   const findings = Array.isArray(packet['knownFindings']) ? packet['knownFindings'] : [];
   const inventory = isRecord(packet['stateInventory']) ? packet['stateInventory'] : {};
   const triggers = Array.isArray(inventory['triggers']) ? inventory['triggers'] : [];
   return {
      unit: { id: String(unit['id']), criteria: readStrings(unit['criteria']) },
      knownFindings: findings
         .filter((finding) => isRecord(finding))
         .map((finding) => ({
            id: String(finding['id']),
            criterion: String(finding['criterion']),
            here: finding['locationHere'] !== undefined,
            needsDescription: finding['needsDescription'] === true,
         })),
      signals: readRecord(packet['signals']),
      stateIds: triggers
         .filter((trigger) => isRecord(trigger))
         .map((trigger) => String(trigger['id'])),
   };
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
   return readRecord(payload);
}

function writeSubmission(packet: Packet, name: string): string {
   const file = join(root, `${name}.json`);
   const failing = new Set(
      packet.knownFindings
         .filter((finding) => finding.here)
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
         confirm: packet.knownFindings
            .filter((finding) => finding.needsDescription)
            .map((finding) => ({
               finding: finding.id,
               title: 'Button has no name',
               description: 'A screen reader announces the button as "button" only.',
               impact: 'Screen reader users cannot tell what the button does.',
               recommendation: 'Give the button visible text or an aria-label.',
               reason:
                  '4.1.2 requires every control to have a name. This button has none.',
            })),
         states: [
            {
               name: 'Every control used',
               covers: packet.stateIds,
               tested: true,
               note: 'Operated each control on the fixture page.',
            },
         ],
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
         const packet = readPacket(next['packet']);
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
            readStrings(report['files']).find((file) => file.endsWith('.html')) ?? '';

         expect(scan['pages']).toEqual([
            expect.objectContaining({ pageId: 'P1', ok: true, findings: 1 }),
         ]);
         expect(packet.unit.id).toBe('P1.semantics');
         expect(packet.knownFindings[0]?.criterion).toBe('4.1.2');
         expect(packet.signals).toHaveProperty('axe');
         expect(submitted['units']).toMatchObject({ done: 1, total: 2 });
         expect(report).toMatchObject({ final: false, verdict: 'fails', findings: 1 });
         expect(packet.knownFindings[0]?.needsDescription).toBe(true);
         expect(readFileSync(html, 'utf8')).toContain(
            '4.1.2 requires every control to have a name. This button has none.',
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
         const units = claims.map((claim) => readPacket(claim['packet']).unit.id);

         expect(new Set(units).size).toBe(workers.length);
      },
      TEST_TIMEOUT_VERY_LONG,
   );
});
