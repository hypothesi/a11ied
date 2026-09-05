import { resolve } from 'node:path';
import { accessibilityDriverSessionSchema } from '@a11ied/contracts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect } from 'vitest';
import type { z } from 'zod';

import { createMcpServer } from '../index.js';

export const ONE_MINUTE_MS = 60_000;
const FIXTURE_ROOT = resolve(import.meta.dirname, '../../../cli/test/fixtures');
export const BUTTON_NAME_FAILURE = resolve(FIXTURE_ROOT, 'button-name-failure.html');
export const BASIC_PAGE = resolve(FIXTURE_ROOT, 'basic-page.html');

export function getInvalidContentText(content: unknown): string {
   if (!Array.isArray(content)) {
      return '';
   }

   const [first] = content;
   if (first?.type !== 'text') {
      return '';
   }

   return first.text;
}

interface Harness {
   client: Client;
   close: () => Promise<void>;
}

async function createHarness(): Promise<Harness> {
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

export async function withHarness(
   callback: (harness: Harness) => Promise<void>,
): Promise<void> {
   const harness = await createHarness();
   try {
      await callback(harness);
   } finally {
      await harness.close();
   }
}

export async function startVirtualSession(
   client: Client,
): Promise<z.infer<typeof accessibilityDriverSessionSchema>> {
   const start = await client.callTool({
      name: 'sr_session',
      arguments: { action: 'start', target: 'virtual', allowVirtual: true },
   });

   expect(start.isError).toBeFalsy();
   const payload = start.structuredContent as { session: unknown };
   return accessibilityDriverSessionSchema.parse(payload.session);
}
