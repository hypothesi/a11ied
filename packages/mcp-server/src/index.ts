import {
   createDoctorReport,
   listSupportedTargets,
   renderDoctorText,
} from '@a11lied/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

export async function startMcpServer(): Promise<void> {
   const server = new McpServer({
      name: 'a11lied',
      version: '0.1.0',
   });

   server.tool(
      'doctor',
      'Return runtime details and the current support matrix.',
      {
         format: z.enum(['text', 'json']).default('text'),
      },
      async ({ format }) => {
         const report = createDoctorReport();

         return {
            content: [
               {
                  type: 'text',
                  text:
                     format === 'json'
                        ? JSON.stringify(report, null, 2)
                        : renderDoctorText(report),
               },
            ],
         };
      },
   );

   server.resource('targets', 'a11lied://targets', async () => ({
      contents: [
         {
            mimeType: 'application/json',
            text: JSON.stringify(listSupportedTargets(), null, 2),
            uri: 'a11lied://targets',
         },
      ],
   }));

   const transport = new StdioServerTransport();
   await server.connect(transport);
}
