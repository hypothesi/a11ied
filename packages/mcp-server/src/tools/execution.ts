import {
   axeRunResultSchema,
   criterionLookupKeySchema,
   wcagLevelSchema,
   wcagVersionSchema,
} from '@a11ied/contracts';
import { runAxe, type DocumentLoad } from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   DEFAULT_WCAG_VERSION,
   createToolResponse,
   readOnlyAnnotations,
   resolveExecutionTarget,
   targetInputSchema,
} from '../lib/shared.js';

const axeCategorySchema = z.enum(['violations', 'passes', 'incomplete', 'inapplicable']);

const axeSelectionInputSchema = targetInputSchema
   .extend({
      version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
      criterion: criterionLookupKeySchema.optional(),
      level: wcagLevelSchema.optional(),
      ruleIds: z.array(z.string()).min(1).optional(),
      include: z.array(axeCategorySchema).optional(),
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

type AxeCategory = z.infer<typeof axeCategorySchema>;

interface AxeResolveArgs {
   resolvedUrl: string;
   version: z.infer<typeof axeSelectionInputSchema>['version'];
   criterion: z.infer<typeof axeSelectionInputSchema>['criterion'];
   level: z.infer<typeof axeSelectionInputSchema>['level'];
   ruleIds: z.infer<typeof axeSelectionInputSchema>['ruleIds'];
}

async function resolveAxeResult(
   args: AxeResolveArgs,
): Promise<z.infer<typeof axeRunResultSchema>> {
   const load: DocumentLoad = { kind: 'goto', url: args.resolvedUrl };
   if (args.criterion) {
      return axeRunResultSchema.parse(
         await runAxe(load, { wcagVersion: args.version, criterion: args.criterion }),
      );
   }
   if (args.level) {
      return axeRunResultSchema.parse(
         await runAxe(load, { wcagVersion: args.version, level: args.level }),
      );
   }
   return axeRunResultSchema.parse(
      await runAxe(load, { wcagVersion: args.version, ruleIds: args.ruleIds ?? [] }),
   );
}

function applyIncludeFilter(
   result: z.infer<typeof axeRunResultSchema>,
   include: AxeCategory[],
): z.infer<typeof axeRunResultSchema> {
   const allCategories: AxeCategory[] = [
      'violations',
      'passes',
      'incomplete',
      'inapplicable',
   ];
   const filtered: Record<string, unknown> = { ...result };
   for (const category of allCategories) {
      if (!include.includes(category)) {
         filtered[category] = [];
      }
   }
   return filtered as z.infer<typeof axeRunResultSchema>;
}

async function runAxeForInput(
   input: z.infer<typeof axeSelectionInputSchema>,
): Promise<z.infer<typeof axeRunResultSchema>> {
   const { version, criterion, level, ruleIds, include, ...targetInput } = input;
   const resolved = await resolveExecutionTarget(targetInput);
   const result = await resolveAxeResult({
      resolvedUrl: resolved.resolvedUrl,
      version,
      criterion,
      level,
      ruleIds,
   });

   if (include && include.length > 0) {
      return applyIncludeFilter(result, include);
   }

   return result;
}

function registerRunAxeTool(server: McpServer): void {
   server.registerTool(
      'run_axe',
      {
         title: 'Run axe',
         description:
            'Run axe-core against a URL target. ' +
            'Use include to limit which result categories are returned (violations, passes, incomplete, inapplicable). ' +
            'Omitting include returns all categories. ' +
            'A warnings field in the response surfaces issues like low page content that may indicate an unmounted SPA shell.',
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
