import { describe, expect, it } from 'vitest';

import { withHarness } from './testing/harness.js';

describe('site audit MCP tools', () => {
   it('registers discovery and report tools', async () => {
      await withHarness(async (harness) => {
         const { tools } = await harness.client.listTools(),
            names = tools.map((tool) => tool.name);

         expect(names).toContain('audit_discover');
         expect(names).toContain('report_build');
      });
   });
});
