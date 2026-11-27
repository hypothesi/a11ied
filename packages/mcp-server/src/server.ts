import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import packageJson from '../package.json' with { type: 'json' };

import { registerResources } from './resources/register.js';
import { registerAuditTools } from './tools/audit.js';
import { registerExecutionTools } from './tools/execution.js';
import { registerKnowledgeTools } from './tools/knowledge.js';
import {
   registerPatternCheckTool,
   registerPatternEvidenceTools,
} from './tools/pattern-check.js';
import { registerPatternTools } from './tools/pattern.js';
import { registerSrActionTool } from './tools/sr-action.js';
import { registerSrListTool } from './tools/sr-list.js';
import { registerSrSessionTool } from './tools/sr-session.js';
import { registerSrTranscriptTools } from './tools/sr-transcript.js';
import { registerTalkBackTool } from './tools/talkback.js';

/** Creates the MCP server with all shipped tools and read-only resources registered. */
export function createMcpServer(): McpServer {
   const server = new McpServer({
      name: 'a11ied',
      version: packageJson.version,
   });

   registerResources(server);
   registerKnowledgeTools(server);
   registerPatternTools(server);
   registerPatternCheckTool(server);
   registerPatternEvidenceTools(server);
   registerExecutionTools(server);
   registerAuditTools(server);
   registerSrSessionTool(server);
   registerSrActionTool(server);
   registerSrListTool(server);
   registerSrTranscriptTools(server);
   registerTalkBackTool(server);

   return server;
}
