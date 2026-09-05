import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerResources } from './resources/register.js';
import { registerApplicabilityTools } from './tools/applicability.js';
import { registerDriverTools } from './tools/driver.js';
import { registerExecutionTools } from './tools/execution.js';
import { registerKnowledgeTools } from './tools/knowledge.js';

/** Creates the MCP server with all shipped tools and read-only resources registered. */
export function createMcpServer(): McpServer {
   const server = new McpServer({
      name: 'a11ied',
      version: '0.1.0',
   });

   registerResources(server);
   registerKnowledgeTools(server);
   registerApplicabilityTools(server);
   registerDriverTools(server);
   registerExecutionTools(server);

   return server;
}
