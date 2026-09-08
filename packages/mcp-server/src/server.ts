import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerResources } from './resources/register.js';
import { registerEvidenceTools } from './tools/evidence.js';
import { registerExecutionTools } from './tools/execution.js';
import { registerKnowledgeTools } from './tools/knowledge.js';
import { registerPatternCheckTool } from './tools/pattern-check.js';
import { registerPatternTools } from './tools/pattern.js';
import { registerSrActionTool } from './tools/sr-action.js';
import { registerSrListTool } from './tools/sr-list.js';
import { registerSrSessionTool } from './tools/sr-session.js';
import { registerSrTranscriptTools } from './tools/sr-transcript.js';

/** Creates the MCP server with all shipped tools and read-only resources registered. */
export function createMcpServer(): McpServer {
   const server = new McpServer({
      name: 'a11ied',
      version: '0.1.0',
   });

   registerResources(server);
   registerKnowledgeTools(server);
   registerPatternTools(server);
   registerPatternCheckTool(server);
   registerExecutionTools(server);
   registerEvidenceTools(server);
   registerSrSessionTool(server);
   registerSrActionTool(server);
   registerSrListTool(server);
   registerSrTranscriptTools(server);

   return server;
}
