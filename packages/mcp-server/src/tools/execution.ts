import {
   axeRunResultSchema,
   criterionLookupKeySchema,
   wcagLevelSchema,
   wcagVersionSchema,
   verificationReportSchema,
   type Platform,
} from '@a11ied/contracts';
import {
   runAxe,
   verifyCriterion,
   verifyLevel,
   resolveDefaultTarget,
   type VerifyCriterionOptions,
   type VerifyLevelOptions,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   DEFAULT_WCAG_VERSION,
   createToolResponse,
   readOnlyAnnotations,
   activeAnnotations,
   resolveExecutionTarget,
   targetInputSchema,
   ensureVirtualTargetAllowed,
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
   if (args.criterion) {
      return axeRunResultSchema.parse(
         await runAxe(args.resolvedUrl, {
            url: args.resolvedUrl,
            wcagVersion: args.version,
            criterion: args.criterion,
         }),
      );
   }
   if (args.level) {
      return axeRunResultSchema.parse(
         await runAxe(args.resolvedUrl, {
            url: args.resolvedUrl,
            wcagVersion: args.version,
            level: args.level,
         }),
      );
   }
   return axeRunResultSchema.parse(
      await runAxe(args.resolvedUrl, {
         url: args.resolvedUrl,
         wcagVersion: args.version,
         ruleIds: args.ruleIds ?? [],
      }),
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

const verifyInputSchema = targetInputSchema
   .extend({
      version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
      criterion: criterionLookupKeySchema.optional(),
      level: wcagLevelSchema.optional(),
      target: z.string().optional(),
      allowVirtual: z.boolean().optional(),
      recording: z.string().optional(),
   })
   .superRefine((value, ctx) => {
      const selections = [
         value.criterion !== undefined,
         value.level !== undefined,
      ].filter(Boolean).length;

      if (selections !== 1) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Choose exactly one of criterion or level.',
            path: ['criterion'],
         });
      }
   });

async function executeMcpVerifyCriterion(args: {
   criterion: string;
   resolvedUrl: string;
   target: string | undefined;
   version: string;
   reportTarget: z.infer<typeof verificationReportSchema>['target'];
   recording: string | undefined;
}): Promise<z.infer<typeof verificationReportSchema>> {
   const verifyOpts: VerifyCriterionOptions = {
      criterion: args.criterion,
      url: args.resolvedUrl,
      wcagVersion: args.version,
      reportTarget: args.reportTarget,
   };
   if (args.target !== undefined) {
      verifyOpts.target = args.target;
   }
   if (args.recording !== undefined) {
      verifyOpts.recordingPath = args.recording;
   }
   return verificationReportSchema.parse(await verifyCriterion(verifyOpts));
}

async function executeMcpVerifyLevel(args: {
   level: string;
   resolvedUrl: string;
   target: string | undefined;
   version: string;
   reportTarget: z.infer<typeof verificationReportSchema>['target'];
   recording: string | undefined;
}): Promise<z.infer<typeof verificationReportSchema>> {
   const verifyOpts: VerifyLevelOptions = {
      level: args.level,
      url: args.resolvedUrl,
      wcagVersion: args.version,
      reportTarget: args.reportTarget,
   };
   if (args.target !== undefined) {
      verifyOpts.target = args.target;
   }
   if (args.recording !== undefined) {
      verifyOpts.recordingPath = args.recording;
   }
   return verificationReportSchema.parse(await verifyLevel(verifyOpts));
}

async function verifyForInput(
   input: z.infer<typeof verifyInputSchema>,
): Promise<z.infer<typeof verificationReportSchema>> {
   const { version, criterion, level, target, allowVirtual, recording, ...targetInput } =
      input;
   const resolved = await resolveExecutionTarget(targetInput);

   if (target) {
      ensureVirtualTargetAllowed(target as Platform, allowVirtual);
   } else {
      const fallback = resolveDefaultTarget();
      ensureVirtualTargetAllowed(fallback.target, allowVirtual);
   }

   if (criterion) {
      return executeMcpVerifyCriterion({
         criterion,
         resolvedUrl: resolved.resolvedUrl,
         target,
         version,
         reportTarget: resolved.reportTarget,
         recording,
      });
   }

   const resolvedLevel = level ?? '';
   return executeMcpVerifyLevel({
      level: resolvedLevel,
      resolvedUrl: resolved.resolvedUrl,
      target,
      version,
      reportTarget: resolved.reportTarget,
      recording,
   });
}

function registerVerifyTool(server: McpServer): void {
   server.registerTool(
      'verify',
      {
         title: 'Verify WCAG conformance',
         description:
            'Turn collected evidence into explicit WCAG criterion or level verdicts. ' +
            'Choose exactly one of criterion or level to verify against the target.',
         inputSchema: verifyInputSchema,
         outputSchema: verificationReportSchema,
         annotations: { ...activeAnnotations, openWorldHint: true },
      },
      async (input) => createToolResponse(await verifyForInput(input)),
   );
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
   registerVerifyTool(server);
}
