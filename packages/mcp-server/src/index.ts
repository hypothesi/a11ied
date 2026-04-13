import process from 'node:process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

function registerShutdownSignals(shutdown: () => Promise<void>): void {
   const handleShutdown = (): void => {
      shutdown().catch((error: unknown) => {
         let message = String(error);
         if (error instanceof Error) {
            message = error.message;
         }
         process.stderr.write(`${message}\n`);
      });
   };

   process.once('SIGINT', handleShutdown);
   process.once('SIGTERM', handleShutdown);
}

async function waitForStdinEnd(shutdown: () => Promise<void>): Promise<void> {
   await new Promise<void>((resolve) => {
      const handleEnd = (): void => {
         shutdown()
            .then(resolve)
            .catch(() => resolve());
      };
      process.stdin.once('end', handleEnd);
   });
}

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

   registerShutdownSignals(shutdown);
   process.stdin.resume();
   await waitForStdinEnd(shutdown);
}

export { createMcpServer } from './server.js';
