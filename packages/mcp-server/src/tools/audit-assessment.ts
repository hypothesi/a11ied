import { auditAssessmentRequestSchema } from '@a11ied/contracts';
import { executeAuditAssessment } from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { activeAnnotations, createToolResponse } from '../lib/shared.js';

/** CLI and MCP share validation, claims, recovery, and evidence evaluation in core. */
export function registerAuditAssessmentTool(server: McpServer): void {
   server.registerTool(
      'audit_assessment',
      {
         title: 'Agent-led audit lifecycle',
         description:
            'Start an assessment, register states and journeys, claim the next procedure, inspect coverage, resume safely, ' +
            'evaluate saved evidence, or finalize validated coverage. This tool sends no UI input. The host agent executes procedures ' +
            'using the declared environment and supplies evidence-backed judgments. Status lists use offset and limit; defaults are 0 and 20.',
         inputSchema: auditAssessmentRequestSchema,
         annotations: activeAnnotations,
      },
      async (input) => {
         const result = await executeAuditAssessment(input);
         return createToolResponse({
            target: { ...result.run.target },
            result: { ...result },
         });
      },
   );
}
