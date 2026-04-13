import {
   criterionLookupKeySchema,
   platformSchema,
   verificationReportSchema,
   wcagLevelSchema,
   wcagVersionSchema,
   type Platform,
} from '@a11ied/contracts';
import { resolveDefaultTarget, verifyCriterion, verifyLevel } from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   DEFAULT_WCAG_VERSION,
   activeAnnotations,
   createToolResponse,
   ensureVirtualTargetAllowed,
   resolveExecutionTarget,
   targetInputSchema,
   type ToolResponse,
} from '../lib/shared.js';

const verifyInputSchema = targetInputSchema.extend({
   criterion: criterionLookupKeySchema.optional(),
   level: wcagLevelSchema.optional(),
   version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
   target: platformSchema.optional(),
   allowVirtual: z.boolean().optional(),
});

type VerifyInput = z.infer<typeof verifyInputSchema>;

type VerifyMode =
   | { kind: 'criterion'; criterion: z.infer<typeof criterionLookupKeySchema> }
   | { kind: 'level'; level: z.infer<typeof wcagLevelSchema> };

const verifyToolConfig = {
   title: 'Verify',
   description:
      'Verify WCAG compliance against a URL target. ' +
      'Pass criterion for a single criterion check, or level for a full conformance-level check. ' +
      'On macOS the default target is VoiceOver (real); on Windows it is NVDA (real). ' +
      'The "virtual" target is a SIMULATION — use real screen readers for higher-fidelity results. ' +
      'Set allowVirtual=true only when you explicitly want simulation. ' +
      'This may launch browsers, run automation, and drive assistive technology.',
   inputSchema: verifyInputSchema,
   outputSchema: verificationReportSchema,
   annotations: activeAnnotations,
};

function resolveVerifyMode(args: {
   criterion: VerifyInput['criterion'];
   level: VerifyInput['level'];
}): VerifyMode {
   if (args.criterion && args.level) {
      throw new Error('Provide exactly one of criterion or level, not both.');
   }
   if (args.criterion) {
      return { kind: 'criterion', criterion: args.criterion };
   }
   if (args.level) {
      return { kind: 'level', level: args.level };
   }
   throw new Error('Provide exactly one of criterion or level.');
}

async function runVerifyMode(args: {
   mode: VerifyMode;
   url: string;
   target: Platform;
   version: string;
   reportTarget: z.infer<typeof verificationReportSchema>['target'];
}): Promise<z.infer<typeof verificationReportSchema>> {
   if (args.mode.kind === 'criterion') {
      return verifyCriterion({
         criterion: args.mode.criterion,
         url: args.url,
         target: args.target,
         wcagVersion: args.version,
         reportTarget: args.reportTarget,
      });
   }

   return verifyLevel({
      level: args.mode.level,
      url: args.url,
      target: args.target,
      wcagVersion: args.version,
      reportTarget: args.reportTarget,
   });
}

async function handleVerifyTool(
   input: VerifyInput,
): Promise<ToolResponse<z.infer<typeof verificationReportSchema>>> {
   const { criterion, level, version, target, allowVirtual, ...targetInput } = input;
   const mode = resolveVerifyMode({ criterion, level });
   const resolved = await resolveExecutionTarget(targetInput);
   const resolvedTarget = target ?? resolveDefaultTarget().target;
   ensureVirtualTargetAllowed(resolvedTarget, allowVirtual);
   const reportTarget = {
      ...resolved.reportTarget,
      platform: resolvedTarget,
   };
   const report = await runVerifyMode({
      mode,
      url: resolved.resolvedUrl,
      target: resolvedTarget,
      version,
      reportTarget,
   });
   return createToolResponse(verificationReportSchema.parse(report));
}

export function registerVerificationTools(server: McpServer): void {
   server.registerTool('verify', verifyToolConfig, handleVerifyTool);
}
