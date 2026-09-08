import { cliExitCodes, type ApgCheckResult } from '@a11ied/contracts';
import { runPatternCheck } from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   createToolResponse,
   describePageReportTarget,
   pageTargetInputSchema,
   readOnlyAnnotations,
   requireLoad,
   resolvePageTarget,
   type PageReportTarget,
} from '../lib/shared.js';

const patternCheckInputSchema = pageTargetInputSchema.extend({
   pattern: z
      .string()
      .min(1)
      .describe('The APG example id to check against, such as combobox-select-only.'),
   selector: z
      .string()
      .min(1)
      .describe('CSS selector for the one widget to check. Required.'),
   table: z
      .string()
      .optional()
      .describe('Probe a later keyboard table by name instead of the first.'),
   setup: z
      .string()
      .optional()
      .describe('Comma separated chords to press before checking.'),
});
type PatternCheckInput = z.infer<typeof patternCheckInputSchema>;

interface PatternCheckToolResult {
   target: PageReportTarget;
   result: ApgCheckResult;
   exitCode: number;
}

async function handlePatternCheck(
   input: PatternCheckInput,
): Promise<PatternCheckToolResult> {
   const resolved = await resolvePageTarget(input, 'pattern check');
   const target = describePageReportTarget(resolved);
   const result = await runPatternCheck({
      load: requireLoad(resolved),
      subject: target.value,
      exampleId: input.pattern,
      selector: input.selector,
      tableName: input.table,
      setupKeys: input.setup,
   });

   const failed =
      result.keyboardRows.some((row) => row.status === 'no-observable-effect') ||
      result.attributeRows.some((row) => row.status === 'broken-reference');

   return {
      target,
      result,
      exitCode: failed ? cliExitCodes.assertion : cliExitCodes.success,
   };
}

/** Registers the ARIA pattern check, which drives a browser. */
export function registerPatternCheckTool(server: McpServer): void {
   server.registerTool(
      'pattern_check',
      {
         title: 'ARIA pattern check',
         description:
            'Check one widget on a page against one APG example. Presses every key the example ' +
            'declares and checks its documented attributes. Returns exitCode 4 for the two ' +
            'findings it will defend: a declared key that changed nothing, and an attribute ' +
            'pointing at an id the document does not have. Every other key comes back with what ' +
            "changed next to the guide's own description, for you to judge; an attribute the " +
            'example documents that the widget never sets is listed in applicabilityHints rather ' +
            'than failed. selector is required and must match one element. Matches the CLI ' +
            'pattern check command.',
         inputSchema: patternCheckInputSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async (input) => createToolResponse({ ...(await handlePatternCheck(input)) }),
   );
}
