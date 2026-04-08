import {
   axeRunResultSchema,
   criterionLookupKeySchema,
   interactionPatternIdSchema,
   interactionPatternResultSchema,
   platformSchema,
   wcagLevelSchema,
   wcagVersionSchema,
   type Platform,
} from '@a11lied/contracts';
import { runAxe, runInteractionPattern } from '@a11lied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   DEFAULT_WCAG_VERSION,
   activeAnnotations,
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
         description: 'Run axe-core against a URL or Storybook story target.',
         inputSchema: axeSelectionInputSchema,
         outputSchema: axeRunResultSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async (input) => createToolResponse(await runAxeForInput(input)),
   );
}

function buildPatternInput(
   input: z.infer<
      ReturnType<
         typeof targetInputSchema.extend<{
            patternId: typeof interactionPatternIdSchema;
            target: ReturnType<typeof platformSchema.default>;
            sessionId: z.ZodOptional<z.ZodString>;
         }>
      >
   >,
   resolvedUrl: string,
): {
   patternId: z.infer<typeof interactionPatternIdSchema>;
   url: string;
   target: Platform;
   sessionId?: string;
} {
   const patternInput: {
      patternId: z.infer<typeof interactionPatternIdSchema>;
      url: string;
      target: Platform;
      sessionId?: string;
   } = {
      patternId: input.patternId,
      url: resolvedUrl,
      target: input.target,
   };

   if (input.sessionId) {
      patternInput.sessionId = input.sessionId;
   }

   return patternInput;
}

const patternInputSchema = targetInputSchema.extend({
   patternId: interactionPatternIdSchema,
   target: platformSchema.default('virtual'),
   sessionId: z.string().min(1).optional(),
});

function registerRunPatternTool(server: McpServer): void {
   server.registerTool(
      'run_pattern',
      {
         title: 'Run pattern',
         description:
            'Run a built-in interaction pattern against a URL or Storybook story target. This may launch browsers or drive assistive technology.',
         inputSchema: patternInputSchema,
         outputSchema: interactionPatternResultSchema,
         annotations: activeAnnotations,
      },
      async (input) => {
         const resolved = await resolveExecutionTarget(input);
         const patternInput = buildPatternInput(input, resolved.resolvedUrl);
         return createToolResponse(
            interactionPatternResultSchema.parse(
               await runInteractionPattern(patternInput),
            ),
         );
      },
   );
}

export function registerExecutionTools(server: McpServer): void {
   registerRunAxeTool(server);
   registerRunPatternTool(server);
}
