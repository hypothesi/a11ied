import {
   cliExitCodes,
   evidenceModeSchema,
   evidenceOutcomeSchema,
   type ApgCheckResult,
} from '@a11ied/contracts';
import {
   getAccessibilityTree,
   hashAccessibilityTree,
   isSetAside,
   listPendingApgRows,
   recordApgJudgment,
   runPatternCheck,
} from '@a11ied/core';
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
      result.keyboardRows.some(
         (row) => row.status === 'no-observable-effect' && !isSetAside(row),
      ) ||
      result.attributeRows.some(
         (row) => row.status === 'broken-reference' && !isSetAside(row),
      );

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

const patternRecordInputSchema = pageTargetInputSchema.extend({
   pattern: z.string().min(1).describe('The APG example the row belongs to.'),
   row: z.string().min(1).describe('The row key, such as combobox-key-home[5].'),
   selector: z
      .string()
      .min(1)
      .describe(
         'The same widget selector the check used. Its accessibility tree is hashed with the judgment.',
      ),
   outcome: evidenceOutcomeSchema,
   mode: evidenceModeSchema.optional(),
   note: z.string().optional(),
   pointer: z.string().optional(),
   assertedBy: z.string().optional(),
   resultsFile: z.string().optional(),
});

function registerPatternRecordTool(server: McpServer): void {
   server.registerTool(
      'pattern_record',
      {
         title: 'ARIA pattern record',
         description:
            'Record what you decided about one row of an APG example that pattern_check could ' +
            'not decide. Record inapplicable when the component does not implement that part of ' +
            'the pattern, and say why in the note. If you have no reason to give, record nothing. ' +
            'The next check sets the row aside until the component changes, at which point the ' +
            'judgment expires and the row counts again. Matches the CLI pattern record command.',
         inputSchema: patternRecordInputSchema,
         annotations: { openWorldHint: true },
      },
      async (input) => {
         const resolved = await resolvePageTarget(input, 'pattern record');
         const target = describePageReportTarget(resolved);
         const tree = await getAccessibilityTree(requireLoad(resolved), {
            selector: input.selector,
         });

         return createToolResponse(
            await recordApgJudgment({
               subject: target.value,
               exampleId: input.pattern,
               rowKey: input.row,
               outcome: input.outcome,
               mode: input.mode,
               note: input.note,
               pointer: input.pointer,
               assertedBy: input.assertedBy,
               subjectHash: hashAccessibilityTree(tree),
               evidence: { file: input.resultsFile },
            }),
         );
      },
   );
}

function registerPatternPendingTool(server: McpServer): void {
   server.registerTool(
      'pattern_pending',
      {
         title: 'ARIA pattern pending',
         description:
            'List the rows of one APG example that have no recorded result for this target yet. ' +
            'Matches the CLI pattern pending command.',
         inputSchema: pageTargetInputSchema.extend({
            pattern: z.string().min(1),
            resultsFile: z.string().optional(),
         }),
         annotations: readOnlyAnnotations,
      },
      async (input) => {
         const resolved = await resolvePageTarget(input, 'pattern pending');
         return createToolResponse(
            await listPendingApgRows({
               subject: describePageReportTarget(resolved).value,
               exampleId: input.pattern,
               evidence: { file: input.resultsFile },
            }),
         );
      },
   );
}

/** Registers the ARIA pattern evidence tools. */
export function registerPatternEvidenceTools(server: McpServer): void {
   registerPatternRecordTool(server);
   registerPatternPendingTool(server);
}
