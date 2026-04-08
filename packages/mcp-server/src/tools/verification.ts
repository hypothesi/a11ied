import {
   criterionLookupKeySchema,
   platformSchema,
   verificationReportSchema,
   wcagLevelSchema,
   wcagVersionSchema,
} from '@a11lied/contracts';
import { verifyCriterion, verifyLevel } from '@a11lied/core';
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
            'Verify one WCAG criterion against a URL or Storybook story target. This may launch browsers, run automation, and drive assistive technology.',
         inputSchema: targetInputSchema.extend({
            criterion: criterionLookupKeySchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
            target: platformSchema.default('virtual'),
         }),
         outputSchema: verificationReportSchema,
         annotations: activeAnnotations,
      },
      async ({ criterion, version, target, ...targetInput }) => {
         const resolved = await resolveExecutionTarget(targetInput);
         return createToolResponse(
            verificationReportSchema.parse(
               await verifyCriterion({
                  criterion,
                  url: resolved.resolvedUrl,
                  target,
                  wcagVersion: version,
                  reportTarget: {
                     ...resolved.reportTarget,
                     platform: target,
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
            'Verify a WCAG conformance level against a URL or Storybook story target. This may launch browsers, run automation, and drive assistive technology.',
         inputSchema: targetInputSchema.extend({
            level: wcagLevelSchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
            target: platformSchema.default('virtual'),
         }),
         outputSchema: verificationReportSchema,
         annotations: activeAnnotations,
      },
      async ({ level, version, target, ...targetInput }) => {
         const resolved = await resolveExecutionTarget(targetInput);
         return createToolResponse(
            verificationReportSchema.parse(
               await verifyLevel({
                  level,
                  url: resolved.resolvedUrl,
                  target,
                  wcagVersion: version,
                  reportTarget: {
                     ...resolved.reportTarget,
                     platform: target,
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
