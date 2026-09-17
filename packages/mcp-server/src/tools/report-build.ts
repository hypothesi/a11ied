import { reportFormatSchema } from '@a11ied/contracts';
import { buildReportBundle } from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { activeAnnotations, createToolResponse } from '../lib/shared.js';

const reportBuildInputSchema = z.object({
   inventoryPath: z.string().min(1),
   resultsDir: z.string().min(1),
   outDir: z.string().min(1),
   title: z.string().min(1).optional(),
   formats: z.array(reportFormatSchema).optional(),
});

export function registerReportBuildTool(server: McpServer): void {
   server.registerTool(
      'report_build',
      {
         title: 'Build a multi-page accessibility report',
         description:
            'Build HTML, PDF, EARL, and JSON outputs from an inventory and page audit results.',
         inputSchema: reportBuildInputSchema,
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            await buildReportBundle({
               inventoryPath: input.inventoryPath,
               resultsDir: input.resultsDir,
               outDir: input.outDir,
               ...(input.title ? { title: input.title } : {}),
               ...(input.formats ? { formats: input.formats } : {}),
               version: '0.1.0',
            }),
         ),
   );
}
