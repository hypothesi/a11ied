import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAuditRun } from '@a11ied/core';
import { createEvidenceTestAssessment } from '../../core/src/evidence/test-fixtures.js';
import { runCli, TEST_TIMEOUT_LONG } from '../../cli/src/testing/setup.js';
import { withHarness } from './testing/harness.js';

const EXIT_USAGE = 2,
   policy = {
      allowFormSubmission: true,
      allowDestructiveActions: false,
      allowedOrigins: [
         'https://createdbyfireside.com',
         'https://account.createdbyfireside.com',
      ],
   };

async function assertPolicy(): Promise<void> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-assessment-policy-'));
   try {
      const cliFile = join(root, 'cli', 'run.json'),
         mcpFile = join(root, 'mcp', 'run.json'),
         policyFile = join(root, 'policy.json');
      const environment = {
         environmentId: 'browser',
         platform: 'virtual',
         os: 'fixture',
         capabilities: [],
         limitations: ['Metadata contract fixture.'],
      };
      await writeFile(policyFile, JSON.stringify(policy));
      const cli = await runCli(
         [
            'audit',
            'run',
            'https://createdbyfireside.com/',
            '--environment',
            '-',
            '--policy',
            policyFile,
            '--id',
            'policy-run',
            '--run',
            cliFile,
            '--json',
         ],
         JSON.stringify(environment),
      );
      await withHarness(async ({ client }) => {
         const mcp = await client.callTool({
            name: 'audit_assessment',
            arguments: {
               action: 'start',
               target: { kind: 'url', value: 'https://createdbyfireside.com/' },
               environment,
               actionPolicy: policy,
               runId: 'policy-run',
               file: mcpFile,
            },
         });
         const cliRun = await readAuditRun(cliFile),
            mcpRun = await readAuditRun(mcpFile);

         expect(cli.status, cli.stdout).toStrictEqual(0);
         expect(mcp.isError).not.toStrictEqual(true);
         expect(cliRun.runId).toStrictEqual('policy-run');
         expect(cliRun.runId).toStrictEqual(mcpRun.runId);
         expect(cliRun.actionPolicy).toEqual(policy);
         expect(cliRun.actionPolicy).toEqual(mcpRun.actionPolicy);
      });
   } finally {
      await rm(root, { recursive: true, force: true });
   }
}

async function assertQueueRejection(kind: string): Promise<void> {
   const fixture = await createEvidenceTestAssessment();
   try {
      const check = fixture.run.checks[0];
      if (!check) {
         throw new Error('Missing fixture check.');
      }
      const changes: Record<string, Record<string, unknown>> = {
         procedure: { procedureId: 'invented' },
         version: { procedureVersion: '999' },
         scope: { scope: check.scope === 'site' ? 'state' : 'site' },
         pattern: {
            pointer: '#control',
            patternRow: { exampleId: 'unknown-example', rowKey: 'missing' },
         },
      };
      const input = { ...check, ...changes[kind] };
      const cli = await runCli(
         ['audit', 'queue', fixture.runFile, '--input', '-', '--json'],
         JSON.stringify(input),
      );
      await withHarness(async ({ client }) => {
         const mcp = await client.callTool({
            name: 'audit_assessment',
            arguments: { action: 'queue', file: fixture.runFile, check: input },
         });
         const unchanged = await readAuditRun(fixture.runFile);

         expect(cli.status, cli.stdout).toStrictEqual(EXIT_USAGE);
         expect(mcp.isError).toStrictEqual(true);
         expect(unchanged).toEqual(fixture.run);
      });
   } finally {
      await rm(dirname(fixture.runFile), { recursive: true, force: true });
   }
}

async function assertRecoveryText(): Promise<void> {
   const fixture = await createEvidenceTestAssessment();
   try {
      const displayedFile = join(dirname(fixture.runFile), 'run with spaces.json');
      await copyFile(fixture.runFile, displayedFile);
      const status = await runCli(['audit', 'status', displayedFile, '--limit', '1']);
      const partial = await runCli(['audit', 'finalize', fixture.runFile, '--partial']);

      expect(status.status, status.stdout).toStrictEqual(0);
      expect(status.stdout).toContain('Coverage issues');
      expect(status.stdout).toContain(
         `More issues: a1 audit status '${displayedFile}' --offset 1`,
      );
      expect(status.stdout).toContain('States');
      expect(status.stdout).toContain('[initial]');
      expect(partial.status).toStrictEqual(0);
      expect(partial.stdout).toContain('Assessment in progress');
      expect(partial.stdout).toContain('Coverage issues');
   } finally {
      await rm(dirname(fixture.runFile), { recursive: true, force: true });
   }
}

describe('assessment input and recovery presentation', () => {
   it(
      'shares approved action policy and custom run ID across CLI and MCP',
      assertPolicy,
      TEST_TIMEOUT_LONG,
   );
   it.each(['procedure', 'version', 'scope', 'pattern'])(
      'rejects invalid queued %s without mutation',
      assertQueueRejection,
      TEST_TIMEOUT_LONG,
   );
   it(
      'shows recovery issues, state IDs, and pagination in normal CLI output',
      assertRecoveryText,
      TEST_TIMEOUT_LONG,
   );
});
