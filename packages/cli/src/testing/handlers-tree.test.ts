import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   createTestServer,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   TEST_TIMEOUT_MEDIUM,
} from './setup.js';

const testServer: TestServerHandle = createTestServer();

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

async function assertTreePrintsYaml(baseUrl: string): Promise<void> {
   const result = await runCli(['tree', `${baseUrl}/basic-page.html`]);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect(result.stdout).toContain('heading');
}

interface RoleNode {
   role: string;
   children: RoleNode[];
}

function collectRoles(entries: RoleNode[]): string[] {
   return entries.flatMap((entry) => [entry.role, ...collectRoles(entry.children)]);
}

async function assertTreeFiltersByRole(baseUrl: string): Promise<void> {
   const result = await runCli([
      'tree',
      `${baseUrl}/basic-page.html`,
      '--role',
      'heading',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const nodes = (json.result as { nodes: RoleNode[] }).nodes;

   expect(collectRoles(nodes)).toContain('heading');
}

async function assertTreeFiltersByName(baseUrl: string): Promise<void> {
   const result = await runCli([
      'tree',
      `${baseUrl}/basic-page.html`,
      '--name',
      'nonexistent-name-xyz',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { nodes: unknown[] }).nodes).toEqual([]);
}

async function assertTreeInlineHtml(): Promise<void> {
   const result = await runCli(['tree', '--html', '<button>Send</button>', '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.target as { kind: string }).kind).toBe('html');
   expect(
      (json.result as { nodes: Array<{ role: string; name?: string }> }).nodes[0],
   ).toMatchObject({ role: 'button', name: 'Send' });
}

describe('cli tree command', () => {
   it(
      'prints the accessibility tree as YAML',
      async () => {
         await assertTreePrintsYaml(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      '--role keeps matching nodes and their ancestors',
      async () => {
         await assertTreeFiltersByRole(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      '--name filters by accessible name',
      async () => {
         await assertTreeFiltersByName(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it('scans inline --html', assertTreeInlineHtml, TEST_TIMEOUT_MEDIUM);
});
