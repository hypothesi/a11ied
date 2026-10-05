import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { reportModelSchema, type ReportModel } from '@a11ied/contracts';
import { readAuditRun } from '@a11ied/core';
import { describe, expect, it } from 'vitest';
import {
   buildInitialInventory,
   readInventory,
   writeInventoryAtomic,
} from '../../core/src/discovery/inventory.js';
import { runCli, TEST_TIMEOUT_LONG } from '../../cli/src/testing/setup.js';
import { withHarness } from './testing/harness.js';

const environment = {
      environmentId: 'fixture-browser',
      platform: 'virtual',
      os: 'fixture',
      capabilities: [],
      limitations: ['Metadata fixture; no live assessment or native reader proof.'],
   },
   target = { kind: 'url', value: 'https://createdbyfireside.com' };

async function startInventory(
   client: Client,
   root: string,
   cli: boolean,
): Promise<string> {
   const inventory = buildInitialInventory(target.value, { scope: 'site' }),
      inventoryPath = join(root, 'inventory.json');
   inventory.run.runId = 'inventory-start-fixture';
   await writeInventoryAtomic(inventory, inventoryPath);
   if (cli) {
      const started = await runCli(
         [
            'audit',
            'run',
            target.value,
            '--environment',
            '-',
            '--inventory',
            inventoryPath,
            '--json',
         ],
         JSON.stringify(environment),
      );

      expect(started.status, started.stderr || started.stdout).toStrictEqual(0);
   } else {
      const started = await client.callTool({
         name: 'audit_assessment',
         arguments: { action: 'start', target, environment, inventoryPath },
      });

      expect(started.isError).not.toStrictEqual(true);
   }
   const linked = await readInventory(inventoryPath),
      run = await readAuditRun(join(root, 'run.json'));

   expect(linked.run.assessmentFile).toStrictEqual(
      await realpath(join(root, 'run.json')),
   );
   expect(run.runId).toStrictEqual(inventory.run.runId);
   expect(run.inventoryPath).toStrictEqual(await realpath(inventoryPath));
   return inventoryPath;
}

async function buildDraft(
   client: Client,
   root: string,
   cli: boolean,
): Promise<ReportModel> {
   const inventoryPath = await startInventory(client, root, cli),
      outDir = join(root, 'report'),
      resultsDir = join(root, 'pages');
   await mkdir(resultsDir);
   if (cli) {
      const built = await runCli([
         'report',
         'build',
         '--inventory',
         inventoryPath,
         '--results-dir',
         resultsDir,
         '--out',
         outDir,
         '--formats',
         'json',
         '--draft',
         '--json',
      ]);

      expect(built.status, built.stderr || built.stdout).toStrictEqual(0);
   } else {
      const built = await client.callTool({
         name: 'report_build',
         arguments: { inventoryPath, resultsDir, outDir, formats: ['json'], draft: true },
      });

      expect(built.isError).not.toStrictEqual(true);
   }
   return reportModelSchema.parse(
      JSON.parse(await readFile(join(outDir, 'report.json'), 'utf8')),
   );
}

async function assertInventoryParity(): Promise<void> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-inventory-parity-'));
   try {
      await withHarness(async ({ client }) => {
         const cli = await buildDraft(client, join(root, 'cli'), true),
            mcp = await buildDraft(client, join(root, 'mcp'), false);

         expect(cli.assessment?.runId).toStrictEqual('inventory-start-fixture');
         expect(mcp.assessment?.runId).toStrictEqual(cli.assessment?.runId);
         expect(cli.assessment?.revision).toStrictEqual(mcp.assessment?.revision);
         expect(cli.assessment?.complete).toStrictEqual(false);
         expect(mcp.assessment?.complete).toStrictEqual(false);
         expect(cli.assessment?.coverage).to.eql(mcp.assessment?.coverage);
      });
   } finally {
      await rm(root, { recursive: true, force: true });
   }
}

describe('CLI and MCP inventory startup', () => {
   it(
      'links discovery to status and draft reporting without JSON edits',
      assertInventoryParity,
      TEST_TIMEOUT_LONG,
   );
});
