import {
   accessibilityDriverSessionSchema,
   criterionLookupResultSchema,
   criterionSearchResponseSchema,
   type CriterionSearchResult,
   verificationReportSchema,
   wcagLookupResultSchema,
} from '@a11ied/contracts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { createTempRoot } from '../../cli/src/testing/fixtures.js';
import { useManagedTestServer } from '../../cli/src/testing/lifecycle.js';

import { createMcpServer } from './index.js';

const ONE_MINUTE_MS = 60_000;
const tempRoots: string[] = [];
const managedServer = useManagedTestServer(tempRoots);

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

async function createHarness(): Promise<{
   client: Client;
   close: () => Promise<void>;
}> {
   const mcpServer = createMcpServer();
   const client = new Client(
      { name: 'a11ied-mcp-test-client', version: '0.1.0' },
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
      name: 'driver_session',
      arguments: { action: 'start', target: 'virtual' },
   });

   expect(start.isError).toBeFalsy();
   return accessibilityDriverSessionSchema.parse(start.structuredContent);
}

async function assertVerificationToolReport(
   harness: Awaited<ReturnType<typeof createHarness>>,
   baseUrl: string,
): Promise<void> {
   const result = await harness.client.callTool({
      name: 'verify',
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
}

describe('wcag lookup tool', () => {
   it('matches CLI lookup semantics', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'wcag_lookup',
            arguments: { criterion: '4.1.3', version: '2.2' },
         });

         expect(result.isError).toBeFalsy();
         const payload = wcagLookupResultSchema.parse(result.structuredContent);
         expect(payload.lookupKey).toBe('4.1.3');
         expect(payload.criterion.id).toBe('4.1.3');
         expect(payload.criterion.slug).toBe('status-messages');
         expect(payload.coverage).toBeUndefined();
      });
   });

   it('includes coverage when requested', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'wcag_lookup',
            arguments: { criterion: '4.1.3', version: '2.2', include_coverage: true },
         });

         expect(result.isError).toBeFalsy();
         const payload = wcagLookupResultSchema.parse(result.structuredContent);
         expect(payload.coverage).toBeDefined();
         expect(payload.strategy).toBeDefined();
      });
   });
});

describe('wcag search tool', () => {
   it('returns ranked criteria with match metadata', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'wcag_search',
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
         const tempRoot = await createTempRoot(tempRoots);
         process.chdir(tempRoot);
         await withHarness(async (harness) => {
            const session = await startVirtualSession(harness.client);
            expect(session.sessionId).toMatch(/^drv_/);

            const invalid = await harness.client.callTool({
               name: 'driver_action',
               arguments: { action: 'next' },
            });

            expect(invalid.isError).toBe(true);
            expect(getInvalidContentText(invalid.content)).toContain(
               'Input validation error',
            );

            const stop = await harness.client.callTool({
               name: 'driver_session',
               arguments: { action: 'stop', sessionId: session.sessionId },
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
            await assertVerificationToolReport(harness, managedServer.getBaseUrl());
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

         expect(uris).toContain('a11ied://wcag/criteria/2.2');
         expect(uris).toContain('a11ied://wcag/levels/2.2');
         expect(uris).toContain('a11ied://wcag/coverage/2.2');
         expect(uris).toContain('a11ied://wcag/verification-strategies/2.2');

         const readCoverage = await harness.client.readResource({
            uri: 'a11ied://wcag/coverage/2.2',
         });
         expect(readCoverage.contents[0]?.uri).toBe('a11ied://wcag/coverage/2.2');
      });
   });
});

describe('tool metadata', () => {
   it('documents side effects for active tools', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.listTools();
         const driverTool = result.tools.find(
            (entry) => entry.name === 'driver_session',
         );
         const verificationTool = result.tools.find(
            (entry) => entry.name === 'verify',
         );

         expect(driverTool?.description).toContain(
            'real',
         );
         expect(driverTool?.description).toContain('targetType');
         expect(verificationTool?.description).toContain(
            'may launch browsers, run automation, and drive assistive technology',
         );
      });
   });
});
