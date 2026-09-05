import { criterionLookupKeySchema, wcagVersionSchema } from '@a11ied/contracts';
import { inspectApplicableTarget, inspectCriterionTarget } from '@a11ied/core';
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

export function registerInspectTools(server: McpServer): void {
   server.registerTool(
      'inspect',
      {
         title: 'Inspect',
         description:
            'Inspect a URL for WCAG applicability. ' +
            'Without a criterion, returns all applicable criteria. ' +
            'With a criterion, explains that specific criterion against the target.',
         inputSchema: targetInputSchema.extend({
            criterion: criterionLookupKeySchema.optional(),
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
         }),
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async ({ criterion, version, ...targetInput }) => {
         if (criterion) {
            return createToolResponse(
               inspectCriterionResultSchema.parse(
                  await inspectCriterionTarget(
                     criterion,
                     buildTargetInput(targetInput),
                     version,
                  ),
               ),
            );
         }
         return createToolResponse(
            inspectApplicableResultSchema.parse(
               await inspectApplicableTarget(buildTargetInput(targetInput), version),
            ),
         );
      },
   );
}
