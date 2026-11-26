import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { getInvalidContentText, withHarness } from '../testing/harness.js';

const root = mkdtempSync(join(tmpdir(), 'a11ied-audit-mcp-'));
const AUDIT = 'acme-ios';

const packetSchema = z.object({
   packet: z
      .object({ unit: z.object({ id: z.string(), criteria: z.array(z.string()) }) })
      .optional(),
});
const statusSchema = z.object({
   status: z.object({
      phase: z.string(),
      units: z.object({ done: z.number(), total: z.number(), blocked: z.number() }),
      findings: z.object({ total: z.number() }),
   }),
});
const reportSchema = z.object({
   files: z.array(z.string()),
   final: z.boolean(),
   verdict: z.string(),
   findings: z.number(),
});

beforeAll(() => {
   vi.stubEnv('A11IED_AUDITS_DIR', root);
});

afterAll(() => {
   vi.unstubAllEnvs();
   rmSync(root, { recursive: true, force: true });
});

async function call(
   client: Client,
   name: string,
   args: Record<string, unknown>,
): Promise<unknown> {
   const result = await client.callTool({
      name,
      arguments: { audit: AUDIT, ...args },
   });

   expect(result.isError, getInvalidContentText(result.content)).toBeFalsy();
   return result.structuredContent;
}

function passAll(criteria: readonly string[]): Record<string, unknown> {
   return {
      results: criteria.map((criterion) => ({
         criterion,
         outcome: 'pass',
         note: 'Checked on the simulator.',
      })),
      summary: 'Checked.',
   };
}

const UNLABELLED_BUTTON = {
   reason: 'The button has no accessible name.',
   title: 'Close button has no label',
   severity: 'serious',
   description: 'VoiceOver announces "button" only.',
   impact: 'Screen reader users cannot tell what it does.',
   recommendation: 'Set accessibilityLabel to "Close".',
   location: 'Sign in sheet, top right',
} as const;

async function passNextUnit(client: Client, worker: string): Promise<void> {
   const { packet } = packetSchema.parse(await call(client, 'audit_next', { worker }));
   await call(client, 'audit_submit', {
      worker,
      unit: packet?.unit.id,
      submission: passAll(packet?.unit.criteria ?? []),
   });
}

describe('audit tools, a mobile audit from start to final report', () => {
   it('creates the audit and one unit per pass for the screen', async () => {
      await withHarness(async ({ client }) => {
         const created = await client.callTool({
            name: 'audit_init',
            arguments: {
               target: 'Acme iOS 4.2',
               id: AUDIT,
               platform: 'ios',
               criteria: ['1.1.1', '2.1.1', '1.4.3'],
               rules: ['Do not complete a purchase'],
            },
         });
         await call(client, 'audit_page', {
            action: 'add',
            locator: 'Launch > Sign in',
            name: 'Sign in',
            kind: 'screen',
         });
         const status = statusSchema.parse(
            await call(client, 'audit_status', { units: true }),
         );

         expect(created.isError).toBeFalsy();
         expect(status.status.units).toMatchObject({ done: 0, total: 3 });
      });
   });

   it('gives two workers different units and repeats the rules in the packet', async () => {
      await withHarness(async ({ client }) => {
         const first = await client.callTool({
            name: 'audit_next',
            arguments: { audit: AUDIT, worker: 'w1' },
         });
         const second = packetSchema.parse(
            await call(client, 'audit_next', { worker: 'w2' }),
         );
         const again = packetSchema.parse(
            await call(client, 'audit_next', { worker: 'w1' }),
         );
         const firstUnit = packetSchema.parse(first.structuredContent).packet?.unit.id;

         expect(firstUnit).toBeDefined();
         expect(second.packet?.unit.id).not.toBe(firstUnit);
         expect(again.packet?.unit.id).toBe(firstUnit);
         expect(getInvalidContentText(first.content)).toContain(
            'Do not complete a purchase',
         );
      });
   });

   it('rejects a failure with no finding and lists the problem', async () => {
      await withHarness(async ({ client }) => {
         const { packet } = packetSchema.parse(
            await call(client, 'audit_next', { worker: 'w1' }),
         );
         const [criterion = ''] = packet?.unit.criteria ?? [];
         const result = await client.callTool({
            name: 'audit_submit',
            arguments: {
               audit: AUDIT,
               worker: 'w1',
               unit: packet?.unit.id,
               submission: {
                  results: [{ criterion, outcome: 'fail', note: 'Unlabelled button.' }],
               },
            },
         });

         expect(result.isError).toBe(true);
         expect(getInvalidContentText(result.content)).toContain('submission-rejected');
         expect(getInvalidContentText(result.content)).toContain(criterion);
      });
   });

   it('accepts a finding, blocks and reopens a unit, and writes a final report', async () => {
      await withHarness(async ({ client }) => {
         const mine = packetSchema.parse(
            await call(client, 'audit_next', { worker: 'w1' }),
         ).packet;
         const [criterion = ''] = mine?.unit.criteria ?? [];
         await call(client, 'audit_submit', {
            worker: 'w1',
            unit: mine?.unit.id,
            submission: {
               results: [{ criterion, outcome: 'fail', note: 'Unlabelled button.' }],
               findings: [{ criterion, ...UNLABELLED_BUTTON }],
            },
         });
         const theirs = packetSchema.parse(
            await call(client, 'audit_next', { worker: 'w2' }),
         ).packet;
         await call(client, 'audit_block', {
            unit: theirs?.unit.id,
            worker: 'w2',
            reason: 'No hardware keyboard on this simulator',
         });
         const blocked = statusSchema.parse(await call(client, 'audit_status', {}));
         await call(client, 'audit_reopen', {
            unit: theirs?.unit.id,
            reason: 'Keyboard connected',
         });
         await Promise.all([passNextUnit(client, 'w2'), passNextUnit(client, 'w3')]);
         const done = packetSchema.parse(
            await call(client, 'audit_next', { worker: 'w1' }),
         );
         const report = reportSchema.parse(await call(client, 'audit_report', {}));
         const markdown = report.files.find((file) => file.endsWith('.md')) ?? '';

         expect(blocked.status.units.blocked).toBe(1);
         expect(done.packet).toBeUndefined();
         expect(report).toMatchObject({ final: true, verdict: 'fails', findings: 1 });
         expect(existsSync(markdown)).toBe(true);
         expect(readFileSync(markdown, 'utf8')).toContain('Close button has no label');
      });
   });
});
