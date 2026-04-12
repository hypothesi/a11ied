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

const verifyInputSchema = targetInputSchema.extend({
   criterion: criterionLookupKeySchema.optional(),
   level: wcagLevelSchema.optional(),
   version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
   target: platformSchema.optional(),
});

export function registerVerificationTools(server: McpServer): void {
   server.registerTool(
      'verify',
      {
         title: 'Verify',
         description:
            'Verify WCAG compliance against a URL or Storybook story target. ' +
            'Pass criterion for a single criterion check, or level for a full conformance-level check. ' +
            'On macOS the default target is VoiceOver (real); on Windows it is NVDA (real). ' +
            'The "virtual" target is a SIMULATION — use real screen readers for higher-fidelity results. ' +
            'This may launch browsers, run automation, and drive assistive technology.',
         inputSchema: verifyInputSchema,
         outputSchema: verificationReportSchema,
         annotations: activeAnnotations,
      },
      async ({ criterion, level, version, target, ...targetInput }) => {
         if (!criterion && !level) {
            throw new Error('Provide exactly one of criterion or level.');
         }
         if (criterion && level) {
            throw new Error('Provide exactly one of criterion or level, not both.');
         }

         const resolved = await resolveExecutionTarget(targetInput);
         const resolvedTarget = target ?? resolveDefaultTarget().target;

         if (criterion) {
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
         }

         return createToolResponse(
            verificationReportSchema.parse(
               await verifyLevel({
                  level: level!,
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
