import {
   axeRunResultSchema,
   criterionLookupKeySchema,
   wcagLevelSchema,
   wcagVersionSchema,
} from '@a11ied/contracts';
import { runAxe } from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   DEFAULT_WCAG_VERSION,
   createToolResponse,
   readOnlyAnnotations,
   resolveExecutionTarget,
   targetInputSchema,
} from '../lib/shared.js';

const axeSelectionInputSchema = targetInputSchema
   .extend({
      version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
      criterion: criterionLookupKeySchema.optional(),
      level: wcagLevelSchema.optional(),
      ruleIds: z.array(z.string()).min(1).optional(),
   })
   .superRefine((value, ctx) => {
      const selections = [
         value.criterion !== undefined,
         value.level !== undefined,
         value.ruleIds !== undefined,
      ].filter(Boolean).length;

      if (selections !== 1) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Choose exactly one of criterion, level, or ruleIds.',
            path: ['criterion'],
         });
      }
   });

async function runAxeForInput(
   input: z.infer<typeof axeSelectionInputSchema>,
): Promise<z.infer<typeof axeRunResultSchema>> {
   const { version, criterion, level, ruleIds, ...targetInput } = input;
   const resolved = await resolveExecutionTarget(targetInput);

   if (criterion) {
      return axeRunResultSchema.parse(
         await runAxe(resolved.resolvedUrl, {
            url: resolved.resolvedUrl,
            wcagVersion: version,
            criterion,
         }),
      );
   }

   if (level) {
      return axeRunResultSchema.parse(
         await runAxe(resolved.resolvedUrl, {
            url: resolved.resolvedUrl,
            wcagVersion: version,
            level,
         }),
      );
   }

   return axeRunResultSchema.parse(
      await runAxe(resolved.resolvedUrl, {
         url: resolved.resolvedUrl,
         wcagVersion: version,
         ruleIds: ruleIds ?? [],
      }),
   );
}

function registerRunAxeTool(server: McpServer): void {
   server.registerTool(
      'run_axe',
      {
         title: 'Run axe',
         description: 'Run axe-core against a URL target.',
         inputSchema: axeSelectionInputSchema,
         outputSchema: axeRunResultSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async (input) => createToolResponse(await runAxeForInput(input)),
   );
}

export function registerExecutionTools(server: McpServer): void {
   registerRunAxeTool(server);
}
