import { execFile } from 'node:child_process';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import {
   cliOutputEnvelopeSchema,
   criterionShowResultSchema,
   doctorReportSchema,
} from '#contracts';
import { cleanupTempRoots, createTempRoot } from './fixtures.js';
import { TEST_TIMEOUT_VERY_LONG } from './setup.js';

const exec = promisify(execFile),
   repoRoot = resolve(import.meta.dirname, '../../../..'),
   tempRoots: string[] = [],
   workspaces = [
      'contracts',
      'earl',
      'wcag-data',
      'wcag-engine',
      'guidepup',
      'core',
      'mcp-server',
      'cli',
   ];
const configSchema = z.object({
   mcpServers: z.object({
      allied: z.object({ command: z.string(), args: z.array(z.string()) }),
   }),
});
let installRoot = '';

async function prepareInstall(): Promise<string> {
   const directory = await createTempRoot(tempRoots);
   await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ name: 'a11ied-install-check', private: true, type: 'module' }),
   );
   await exec(
      'npm',
      [
         'pack',
         '--ignore-scripts',
         '--pack-destination',
         directory,
         ...workspaces.flatMap((workspace) => ['--workspace', `packages/${workspace}`]),
      ],
      { cwd: repoRoot },
   );
   const entries = await readdir(directory),
      files = entries.filter((file) => file.endsWith('.tgz'));
   await exec(
      'npm',
      [
         'install',
         '--prefer-offline',
         '--ignore-scripts',
         '--no-audit',
         '--no-fund',
         '--no-package-lock',
         ...files.map((file) => join(directory, file)),
      ],
      { cwd: directory },
   );
   return directory;
}

async function assertPackedDirectory(source: string, installed: string): Promise<void> {
   const entries = await readdir(source, { recursive: true, withFileTypes: true });

   await Promise.all(
      entries
         .filter((item) => item.isFile())
         .map(async (entry) => {
            const sourceFile = join(entry.parentPath, entry.name);
            const installedFile = join(installed, relative(source, sourceFile));
            const [installedContent, sourceContent] = await Promise.all([
               readFile(installedFile),
               readFile(sourceFile),
            ]);

            expect(installedContent).to.eql(sourceContent);
         }),
   );
}

async function withStdioClient(
   command: string,
   args: string[],
   cwd: string,
): Promise<void> {
   const client = new Client(
         { name: 'packed-install-check', version: '0.1.0' },
         { capabilities: {} },
      ),
      transport = new StdioClientTransport({ command, args, cwd, stderr: 'pipe' });
   try {
      await client.connect(transport);
      const response = await client.callTool({
         name: 'doctor',
         arguments: { task: 'scan' },
      });
      const report = doctorReportSchema.parse(response.structuredContent);

      expect(Boolean(response.isError)).toStrictEqual(false);
      expect(report.request?.task).toStrictEqual('scan');
      expect(report.targets.map((target) => target.platform)).to.eql(['virtual']);
   } finally {
      await client.close();
      await transport.close();
   }
}

beforeAll(async () => {
   installRoot = await prepareInstall();
}, TEST_TIMEOUT_VERY_LONG);
afterAll(async () => cleanupTempRoots(tempRoots));

describe('packed installation outside the workspace', () => {
   it('loads CLI standards data and both complete skills', async () => {
      const cli = join(installRoot, 'node_modules/a11ied/dist/cli.js');
      const result = await exec(process.execPath, [cli, 'wcag', '2.4.1', '--json'], {
         cwd: installRoot,
      });

      expect(
         criterionShowResultSchema.parse(
            cliOutputEnvelopeSchema.parse(JSON.parse(result.stdout)).result,
         ).criterion.id,
      ).toStrictEqual('2.4.1');
      await assertPackedDirectory(
         join(repoRoot, 'packages/skills'),
         join(installRoot, 'node_modules/a11ied/dist/skills'),
      );
      await Promise.all(
         ['core', 'guidepup'].map((workspace) =>
            assertPackedDirectory(
               join(repoRoot, 'packages', workspace, 'scripts'),
               join(installRoot, 'node_modules/@a11ied', workspace, 'scripts'),
            ),
         ),
      );
      await access(join(installRoot, 'node_modules/@a11ied/core/dist/driver/broker.js'));
      await access(
         join(installRoot, 'node_modules/@a11ied/guidepup/dist/virtual-page.js'),
      );
   });

   it('launches the installed CLI MCP server with separate executable and args', async () => {
      await withStdioClient(
         process.execPath,
         [join(installRoot, 'node_modules/a11ied/dist/cli.js'), 'mcp'],
         installRoot,
      );
   });

   it('launches the repository MCP configuration as a fresh stdio client', async () => {
      const config = configSchema.parse(
         JSON.parse(await readFile(join(repoRoot, 'mcp.example.json'), 'utf8')),
      );
      await withStdioClient(
         config.mcpServers.allied.command,
         config.mcpServers.allied.args,
         repoRoot,
      );
   });
});
