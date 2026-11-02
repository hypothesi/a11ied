import { runAuditProbes } from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { activeAnnotations, createToolResponse } from '../lib/shared.js';

/** Mirrors `a1 audit probe`: the browser decides what it can and records the evidence. */
export function registerAuditProbeTool(server: McpServer): void {
   server.registerTool(
      'audit_probe',
      {
         title: 'Probe an assessment run in a browser',
         description:
            'Claim each check the run environment supports, probe the page in a browser, and record verified evidence with an outcome. ' +
            'Checks needing a screen reader or a person stay unclaimed for the host agent.',
         inputSchema: z.object({
            file: z.string().min(1).describe('The run file from audit run.'),
            limit: z
               .number()
               .int()
               .positive()
               .optional()
               .describe('Stop after this many checks.'),
         }),
         annotations: activeAnnotations,
      },
      async (input) => {
         const result = await runAuditProbes(input);
         return createToolResponse({
            target: { kind: 'file', value: input.file },
            result: { ...result },
         });
      },
   );
}
