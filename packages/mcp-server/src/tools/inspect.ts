import { criterionLookupKeySchema, wcagVersionSchema } from '@a11lied/contracts';
import { inspectApplicableTarget, inspectCriterionTarget } from '@a11lied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
   DEFAULT_WCAG_VERSION,
   buildTargetInput,
   createToolResponse,
   inspectApplicableResultSchema,
   inspectCriterionResultSchema,
   readOnlyAnnotations,
   targetInputSchema,
} from '../lib/shared.js';

function registerApplicableTool(server: McpServer): void {
   server.registerTool(
      'inspect_applicable',
      {
         title: 'Inspect applicable criteria',
         description:
            'Explain which WCAG criteria look relevant for a URL or Storybook story target.',
         inputSchema: targetInputSchema.extend({
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
         }),
         outputSchema: inspectApplicableResultSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async ({ version, ...targetInput }) =>
         createToolResponse(
            inspectApplicableResultSchema.parse(
               await inspectApplicableTarget(buildTargetInput(targetInput), version),
            ),
         ),
   );
}

function registerCriterionTool(server: McpServer): void {
   server.registerTool(
      'inspect_criterion',
      {
         title: 'Inspect criterion applicability',
         description: 'Explain one criterion against a URL or Storybook story target.',
         inputSchema: targetInputSchema.extend({
            criterion: criterionLookupKeySchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
         }),
         outputSchema: inspectCriterionResultSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async ({ criterion, version, ...targetInput }) =>
         createToolResponse(
            inspectCriterionResultSchema.parse(
               await inspectCriterionTarget(
                  criterion,
                  buildTargetInput(targetInput),
                  version,
               ),
            ),
         ),
   );
}

export function registerInspectTools(server: McpServer): void {
   registerApplicableTool(server);
   registerCriterionTool(server);
}
