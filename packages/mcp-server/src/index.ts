import process from 'node:process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

/** Starts the stdio MCP server for the current process. */
export async function startMcpServer(): Promise<void> {
   const server = createMcpServer();
   const transport = new StdioServerTransport();
   await server.connect(transport);

   if (process.stderr.isTTY) {
      process.stderr.write('a11ied MCP server ready (stdio)\n');
   }

   const shutdown = async (): Promise<void> => {
      try {
         await server.close();
      } finally {
         await transport.close();
      }
   };

   process.once('SIGINT', () => {
      void shutdown().finally(() => process.exit(0));
   });
   process.once('SIGTERM', () => {
      void shutdown().finally(() => process.exit(0));
   });

   process.stdin.resume();
   await new Promise<void>((resolve) => {
      transport.onclose = () => resolve();
   });
}

export { createMcpServer } from './server.js';
