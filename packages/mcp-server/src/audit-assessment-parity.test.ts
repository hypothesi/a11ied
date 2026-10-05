import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { readAuditRun, recordEvidence } from '@a11ied/core';
import {
   createEvidenceTestAssessment,
   type EvidenceTestFixture,
} from '../../core/src/evidence/test-fixtures.js';
import { runCli, TEST_TIMEOUT_LONG } from '../../cli/src/testing/setup.js';
import { withHarness } from './testing/harness.js';

const EXIT_USAGE = 2,
   INVALID_LIMIT = 101,
   STATE_COUNT = 2;
const nextSchema = z.object({
      next: z.object({
         check: z.object({ checkId: z.string() }),
         procedure: z.object({ actions: z.array(z.string()) }),
      }),
   }),
   resultSchema = z.object({ result: z.record(z.string(), z.unknown()) });
const environment = {
      environmentId: 'browser',
      platform: 'virtual',
      os: 'fixture',
      capabilities: ['rendered-ui', 'dom', 'keyboard', 'screenshot', 'markup-validation'],
      limitations: ['Simulated contract fixture; no native reader proof.'],
   },
   target = { kind: 'url', value: 'https://createdbyfireside.com/' };

async function assertDefaults(app: boolean): Promise<void> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-assessment-defaults-'));
   try {
      const cliFile = join(root, 'cli', 'run.json'),
         environmentFile = join(root, 'environment.json'),
         mcpFile = join(root, 'mcp', 'run.json');
      await writeFile(environmentFile, JSON.stringify(environment));
      await withHarness(async ({ client }) => {
         const cli = await runCli([
            'audit',
            'run',
            ...(app ? ['--app', 'FixtureApp'] : [target.value]),
            '--environment',
            environmentFile,
            '--run',
            cliFile,
            '--json',
         ]);
         const mcp = await client.callTool({
            name: 'audit_assessment',
            arguments: {
               action: 'start',
               target: app ? { kind: 'app', value: 'FixtureApp' } : target,
               environment,
               file: mcpFile,
            },
         });
         const cliRun = await readAuditRun(cliFile),
            mcpRun = await readAuditRun(mcpFile);

         expect(cli.status, cli.stderr || cli.stdout).toStrictEqual(0);
         expect(mcp.isError).not.toStrictEqual(true);
         expect(cliRun.profile).toEqual(mcpRun.profile);
         expect(cliRun.profile).toEqual({ wcagVersion: '2.2', level: 'AA' });
         expect(cliRun.scope).toStrictEqual(app ? 'app' : 'site');
         expect(cliRun.scope).toStrictEqual(mcpRun.scope);
         expect(cliRun.actionPolicy).toEqual(mcpRun.actionPolicy);
         expect(cliRun.states).toEqual([]);
         expect(cliRun.activeCheckId).toBeUndefined();
      });
   } finally {
      await rm(root, { recursive: true, force: true });
   }
}

async function registerState(file: string, stateId: string): Promise<void> {
   const state = {
      stateId,
      target,
      label: stateId,
      fingerprint: stateId,
      environmentId: 'browser',
      artifacts: ['observation.json'],
      setup: [],
   };
   const registered = await runCli(
      ['audit', 'state', file, '--input', '-', '--json'],
      JSON.stringify(state),
   );

   expect(registered.status, registered.stdout).toStrictEqual(0);
}

async function assertScopeParity(client: Client, file: string): Promise<void> {
   await registerState(file, 'initial');
   await registerState(file, 'menu-open');
   const journey = await client.callTool({
      name: 'audit_assessment',
      arguments: {
         action: 'journey',
         file,
         journey: {
            journeyId: 'menu',
            label: 'Open menu',
            stateIds: ['initial', 'menu-open'],
            status: 'discovered',
         },
      },
   });
   const cliStatus = await runCli(['audit', 'status', file, '--limit', '1', '--json']),
      mcpStatus = await client.callTool({
         name: 'audit_assessment',
         arguments: { action: 'status', file, limit: 1 },
      });
   const status = resultSchema.parse(mcpStatus.structuredContent).result;

   expect(journey.isError).not.toStrictEqual(true);
   expect(resultSchema.parse(JSON.parse(cliStatus.stdout)).result).toEqual(status);
   expect(status.states).toMatchObject({
      total: STATE_COUNT,
      items: [{ stateId: 'initial' }],
      nextOffset: 1,
   });
   expect(status).toHaveProperty('issues.items.0.code', 'audit-journey-incomplete');
}

async function assertBlockerRefinement(
   client: Client,
   file: string,
   checkId: string,
): Promise<void> {
   const before = await readAuditRun(file);
   const cli = await runCli([
      'audit',
      'block',
      file,
      '--check',
      checkId,
      '--reason',
      'Target window unavailable.',
      '--json',
   ]);
   const mcp = await client.callTool({
      name: 'audit_assessment',
      arguments: {
         action: 'block',
         file,
         checkId,
         reason: 'Restore target window before retrying.',
      },
   });
   const after = await readAuditRun(file),
      previous = before.checks.find((check) => check.checkId === checkId);

   expect(cli.status).toStrictEqual(0);
   expect(mcp.isError).not.toStrictEqual(true);
   expect(after.checks.find((check) => check.checkId === checkId)).toMatchObject({
      ...previous,
      reason: 'Restore target window before retrying.',
      updatedAt: expect.any(String),
   });
   expect(after.activeCheckId).toBeUndefined();
}

async function assertRecoveryParity(client: Client, file: string): Promise<void> {
   const selected = await client.callTool({
      name: 'audit_assessment',
      arguments: { action: 'next', file },
   });
   const duplicate = await runCli(['audit', 'next', file, '--json']),
      next = nextSchema.parse(resultSchema.parse(selected.structuredContent).result).next;

   expect(next.procedure.actions.length).toBeGreaterThan(0);
   expect(duplicate.status).toStrictEqual(EXIT_USAGE);
   expect(duplicate.stdout).toContain('audit-check-running');

   await runCli(['audit', 'resume', file, '--json']);
   const blocked = await readAuditRun(file);

   expect(
      blocked.checks.find((check) => check.checkId === next.check.checkId)?.status,
   ).toStrictEqual('blocked');

   await assertBlockerRefinement(client, file, next.check.checkId);
   await client.callTool({
      name: 'audit_assessment',
      arguments: { action: 'resume', file, retryCheckIds: [next.check.checkId] },
   });
   const retried = await runCli(['audit', 'next', file, '--json']);

   expect(
      nextSchema.parse(resultSchema.parse(JSON.parse(retried.stdout)).result).next.check
         .checkId,
   ).toStrictEqual(next.check.checkId);

   const blockedAgain = await runCli([
         'audit',
         'block',
         file,
         '--check',
         next.check.checkId,
         '--reason',
         'Restore the menu before continuing.',
         '--json',
      ]),
      invalidLimit = await client.callTool({
         name: 'audit_assessment',
         arguments: { action: 'status', file, limit: INVALID_LIMIT },
      });

   expect(blockedAgain.status).toStrictEqual(0);
   expect(invalidLimit.isError).toStrictEqual(true);
}

async function assertRecovery(): Promise<void> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-assessment-recovery-'));
   const file = join(root, 'run.json');
   try {
      await withHarness(async ({ client }) => {
         await client.callTool({
            name: 'audit_assessment',
            arguments: { action: 'start', target, environment, file, scope: 'page' },
         });
         await assertScopeParity(client, file);
         await assertRecoveryParity(client, file);
      });
   } finally {
      await rm(root, { recursive: true, force: true });
   }
}

async function assertEvaluation(
   client: Client,
   fixture: EvidenceTestFixture,
): Promise<{ checkId: string; evidenceId: string }> {
   const saved = await recordEvidence(fixture.record, fixture);
   const checkId = saved.record.provenance?.checkId ?? '',
      evidenceId = saved.record.evidenceId ?? '';
   const mismatched = await client.callTool({
      name: 'audit_assessment',
      arguments: {
         action: 'evaluate',
         file: fixture.runFile,
         checkId,
         evidenceIds: [evidenceId],
         outcome: 'failed',
      },
   });
   const evaluated = await runCli([
      'audit',
      'evaluate',
      fixture.runFile,
      '--check',
      checkId,
      '--outcome',
      'passed',
      '--evidence',
      evidenceId,
      '--json',
   ]);
   const cliStatus = await runCli(['audit', 'status', fixture.runFile, '--json']),
      mcpStatus = await client.callTool({
         name: 'audit_assessment',
         arguments: { action: 'status', file: fixture.runFile },
      });

   expect(mismatched.isError).toStrictEqual(true);
   expect(evaluated.status, evaluated.stdout).toStrictEqual(0);
   expect(resultSchema.parse(JSON.parse(cliStatus.stdout)).result).toEqual(
      resultSchema.parse(mcpStatus.structuredContent).result,
   );
   expect(resultSchema.parse(mcpStatus.structuredContent).result.coverage).toMatchObject({
      assessed: 1,
   });
   return { checkId, evidenceId };
}

async function assertFinalization(
   client: Client,
   fixture: EvidenceTestFixture,
   ids: { checkId: string; evidenceId: string },
): Promise<void> {
   const repeated = await runCli([
      'audit',
      'evaluate',
      fixture.runFile,
      '--check',
      ids.checkId,
      '--outcome',
      'passed',
      '--evidence',
      ids.evidenceId,
      '--json',
   ]);
   const final = await client.callTool({
      name: 'audit_assessment',
      arguments: { action: 'finalize', file: fixture.runFile },
   });
   const partial = await runCli([
      'audit',
      'finalize',
      fixture.runFile,
      '--partial',
      '--json',
   ]);
   const run = await readAuditRun(fixture.runFile);

   expect(repeated.status).toStrictEqual(EXIT_USAGE);
   expect(final.isError).toStrictEqual(true);
   expect(partial.status).toStrictEqual(0);
   expect(resultSchema.parse(JSON.parse(partial.stdout)).result.complete).toStrictEqual(
      false,
   );
   expect(run.status).toStrictEqual('active');
}

async function assertEvidence(): Promise<void> {
   const fixture = await createEvidenceTestAssessment();
   try {
      await withHarness(async ({ client }) => {
         const ids = await assertEvaluation(client, fixture);
         await assertFinalization(client, fixture, ids);
      });
   } finally {
      await rm(dirname(fixture.runFile), { recursive: true, force: true });
   }
}

describe('CLI and MCP assessment lifecycle parity', () => {
   it.each([false, true])(
      'shares defaults for app=%s without UI input',
      assertDefaults,
      TEST_TIMEOUT_LONG,
   );
   it(
      'shares claims, pagination, state identity, and interruption recovery',
      assertRecovery,
      TEST_TIMEOUT_LONG,
   );
   it(
      'shares verified evidence evaluation and rejects incomplete finalization',
      assertEvidence,
      TEST_TIMEOUT_LONG,
   );
});
