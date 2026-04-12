import {
   criterionLookupKeySchema,
   platformSchema,
   verificationReportSchema,
   wcagLevelSchema,
   wcagVersionSchema,
} from '@a11ied/contracts';
import { resolveDefaultTarget, verifyCriterion, verifyLevel } from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
   DEFAULT_WCAG_VERSION,
   activeAnnotations,
   createToolResponse,
   resolveExecutionTarget,
   targetInputSchema,
} from '../lib/shared.js';

function registerVerifyCriterionTool(server: McpServer): void {
   server.registerTool(
      'verify_criterion',
      {
         title: 'Verify criterion',
         description:
            'Verify one WCAG criterion against a URL or Storybook story target. ' +
            'On macOS the default target is VoiceOver (real); on Windows it is NVDA (real). ' +
            'The "virtual" target is a SIMULATION — use real screen readers for higher-fidelity results. ' +
            'This may launch browsers, run automation, and drive assistive technology.',
         inputSchema: targetInputSchema.extend({
            criterion: criterionLookupKeySchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
            target: platformSchema.optional(),
         }),
         outputSchema: verificationReportSchema,
         annotations: activeAnnotations,
      },
      async ({ criterion, version, target, ...targetInput }) => {
         const resolved = await resolveExecutionTarget(targetInput);
         const resolvedTarget = target ?? resolveDefaultTarget().target;
         return createToolResponse(
            verificationReportSchema.parse(
               await verifyCriterion({
                  criterion,
                  url: resolved.resolvedUrl,
                  target: resolvedTarget,
                  wcagVersion: version,
                  reportTarget: {
                     ...resolved.reportTarget,
                     platform: resolvedTarget,
                  },
               }),
            ),
         );
      },
   );
}

function registerVerifyLevelTool(server: McpServer): void {
   server.registerTool(
      'verify_level',
      {
         title: 'Verify level',
         description:
            'Verify a WCAG conformance level against a URL or Storybook story target. ' +
            'On macOS the default target is VoiceOver (real); on Windows it is NVDA (real). ' +
            'The "virtual" target is a SIMULATION — use real screen readers for higher-fidelity results. ' +
            'This may launch browsers, run automation, and drive assistive technology.',
         inputSchema: targetInputSchema.extend({
            level: wcagLevelSchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
            target: platformSchema.optional(),
         }),
         outputSchema: verificationReportSchema,
         annotations: activeAnnotations,
      },
      async ({ level, version, target, ...targetInput }) => {
         const resolved = await resolveExecutionTarget(targetInput);
         const resolvedTarget = target ?? resolveDefaultTarget().target;
         return createToolResponse(
            verificationReportSchema.parse(
               await verifyLevel({
                  level,
                  url: resolved.resolvedUrl,
                  target: resolvedTarget,
                  wcagVersion: version,
                  reportTarget: {
                     ...resolved.reportTarget,
                     platform: resolvedTarget,
                  },
               }),
            ),
         );
      },
   );
}

export function registerVerificationTools(server: McpServer): void {
   registerVerifyCriterionTool(server);
   registerVerifyLevelTool(server);
}
