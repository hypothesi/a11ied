import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

/** Starts the stdio MCP server for the current process. */
export async function startMcpServer(): Promise<void> {
   const server = createMcpServer();
   const transport = new StdioServerTransport();
   await server.connect(transport);
}

export { createMcpServer } from './server.js';
