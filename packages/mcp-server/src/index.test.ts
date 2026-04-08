import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
   accessibilityDriverSessionSchema,
   criterionLookupResultSchema,
   criterionSearchResponseSchema,
   type CriterionSearchResult,
   verificationReportSchema,
} from '@a11lied/contracts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { createMcpServer } from './index.js';

const fixtureRoot = resolve(import.meta.dirname, '../../cli/test/fixtures');
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const ONE_MINUTE_MS = 60_000;

let baseUrl = '';
let server: ReturnType<typeof createServer> = undefined as unknown as ReturnType<
   typeof createServer
>;
const tempRoots: string[] = [];
const repoRoot = process.cwd();

function getInvalidContentText(content: unknown): string {
   if (!Array.isArray(content)) {
      return '';
   }

   const [first] = content;
   if (first?.type !== 'text') {
      return '';
   }

   return first.text;
}

async function createTempRoot(): Promise<string> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11lied-mcp-'));
   tempRoots.push(root);
   return root;
}

async function createHarness(): Promise<{
   client: Client;
   close: () => Promise<void>;
}> {
   const mcpServer = createMcpServer();
   const client = new Client(
      { name: 'a11lied-mcp-test-client', version: '0.1.0' },
      { capabilities: {} },
   );
   const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
   await Promise.all([
      mcpServer.connect(serverTransport),
      client.connect(clientTransport),
   ]);

   return {
      client,
      close: async () => {
         await client.close();
         await mcpServer.close();
      },
   };
}

async function withHarness(
   callback: (harness: Awaited<ReturnType<typeof createHarness>>) => Promise<void>,
): Promise<void> {
   const harness = await createHarness();
   try {
      await callback(harness);
   } finally {
      await harness.close();
   }
}

async function startVirtualSession(
   client: Client,
): Promise<z.infer<typeof accessibilityDriverSessionSchema>> {
   const start = await client.callTool({
      name: 'driver_start_session',
      arguments: { target: 'virtual' },
   });

   expect(start.isError).toBeFalsy();
   return accessibilityDriverSessionSchema.parse(start.structuredContent);
}

beforeAll(async () => {
   server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const filePath = resolve(fixtureRoot, `.${requestUrl.pathname}`);

      try {
         const html = readFileSync(filePath, 'utf8');
         response.writeHead(HTTP_OK, { 'content-type': 'text/html; charset=utf-8' });
         response.end(html);
      } catch {
         response.writeHead(HTTP_NOT_FOUND, {
            'content-type': 'text/plain; charset=utf-8',
         });
         response.end('not found');
      }
   });

   await new Promise<void>((resolveServer) => {
      server.listen(0, '127.0.0.1', () => {
         const address = server.address();
         if (!address || typeof address === 'string') {
            throw new Error('expected an address object');
         }
         baseUrl = `http://127.0.0.1:${address.port}`;
         resolveServer();
      });
   });
});

afterAll(async () => {
   await new Promise<void>((resolveServer, rejectServer) => {
      server.close((error) => {
         if (error) {
            rejectServer(error);
            return;
         }
         resolveServer();
      });
   });
});

afterEach(async () => {
   process.chdir(repoRoot);
   await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
   tempRoots.length = 0;
});

describe('criterion lookup tool', () => {
   it('matches CLI lookup semantics', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'criterion_lookup',
            arguments: { criterion: '4.1.3', version: '2.2' },
         });

         expect(result.isError).toBeFalsy();
         const payload = criterionLookupResultSchema.parse(result.structuredContent);
         expect(payload.lookupKey).toBe('4.1.3');
         expect(payload.criterion.id).toBe('4.1.3');
         expect(payload.criterion.slug).toBe('status-messages');
      });
   });
});

describe('search tool', () => {
   it('returns ranked criteria with match metadata', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'search',
            arguments: { query: 'status message', version: '2.2', limit: 5 },
         });

         expect(result.isError).toBeFalsy();
         const payload = criterionSearchResponseSchema.parse(result.structuredContent);
         expect(
            payload.results.some(
               (entry: CriterionSearchResult) => entry.criterionId === '4.1.3',
            ),
         ).toBe(true);
         expect(payload.results[0]?.matches.length).toBeGreaterThan(0);
      });
   });
});

describe('driver session tools', () => {
   it(
      'require a session id after session start',
      async () => {
         const tempRoot = await createTempRoot();
         process.chdir(tempRoot);
         await withHarness(async (harness) => {
            const session = await startVirtualSession(harness.client);
            expect(session.sessionId).toMatch(/^drv_/);

            const invalid = await harness.client.callTool({
               name: 'driver_next_item',
               arguments: {},
            });

            expect(invalid.isError).toBe(true);
            expect(getInvalidContentText(invalid.content)).toContain(
               'Input validation error',
            );

            const stop = await harness.client.callTool({
               name: 'driver_stop_session',
               arguments: { sessionId: session.sessionId },
            });

            expect(stop.isError).toBeFalsy();
         });
      },
      ONE_MINUTE_MS,
   );
});

describe('verification tool', () => {
   it(
      'returns the same top-level report fields as the CLI report shape',
      async () => {
         await withHarness(async (harness) => {
            const result = await harness.client.callTool({
               name: 'verify_criterion',
               arguments: {
                  criterion: '4.1.2',
                  url: `${baseUrl}/button-name-failure.html`,
                  target: 'virtual',
                  version: '2.2',
               },
            });

            expect(result.isError).toBeFalsy();
            const report = verificationReportSchema.parse(result.structuredContent);
            expect(report.target).toHaveProperty('kind');
            expect(report).toHaveProperty('wcagVersion');
            expect(report).toHaveProperty('requestedScope');
            expect(report).toHaveProperty('summary');
            expect(report).toHaveProperty('criteria');
            expect(report.criteria[0]?.criterionId).toBe('4.1.2');
            expect(report.criteria[0]?.verdict).toBe('fail');
         });
      },
      ONE_MINUTE_MS,
   );
});

describe('resource exposure', () => {
   it('lists read-only resources for standards material', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.listResources();
         const uris = result.resources.map((entry) => entry.uri);

         expect(uris).toContain('a11lied://wcag/criteria/2.2');
         expect(uris).toContain('a11lied://wcag/levels/2.2');
         expect(uris).toContain('a11lied://wcag/coverage/2.2');
         expect(uris).toContain('a11lied://wcag/verification-strategies/2.2');

         const readCoverage = await harness.client.readResource({
            uri: 'a11lied://wcag/coverage/2.2',
         });
         expect(readCoverage.contents[0]?.uri).toBe('a11lied://wcag/coverage/2.2');
      });
   });
});

describe('tool metadata', () => {
   it('documents side effects for active tools', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.listTools();
         const driverTool = result.tools.find(
            (entry) => entry.name === 'driver_start_session',
         );
         const verificationTool = result.tools.find(
            (entry) => entry.name === 'verify_criterion',
         );

         expect(driverTool?.description).toContain(
            'may launch or drive assistive technology',
         );
         expect(verificationTool?.description).toContain(
            'may launch browsers, run automation, and drive assistive technology',
         );
      });
   });
});
