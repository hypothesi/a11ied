import {
   apgFindResultSchema,
   apgLookupResultSchema,
   apgPatternListResultSchema,
} from '@a11ied/contracts';
import {
   findApgExamples,
   listApgPatternSummaries,
   showApgPatternOrExample,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createToolResponse, readOnlyAnnotations } from '../lib/shared.js';

function registerPatternShowTool(server: McpServer): void {
   server.registerTool(
      'pattern_show',
      {
         title: 'ARIA pattern show',
         description:
            'Show one ARIA Authoring Practices Guide pattern by id (such as "combobox") with the ' +
            "guide's own text for it, in sections: About This Pattern, Keyboard Interaction, and " +
            'WAI-ARIA Roles, States, and Properties, plus the examples the guide publishes for it. ' +
            'Or show one example by id (such as ' +
            '"combobox-select-only") with its keyboard support table and its role, property, state, ' +
            'and tabindex table. Read this before writing or reviewing a custom widget rather than ' +
            'recalling the pattern. Omit name to list every pattern. Matches the CLI pattern ' +
            '<name> and pattern list commands.',
         inputSchema: z.object({
            name: z
               .string()
               .min(1)
               .optional()
               .describe('A pattern id or an example id. Omit to list every pattern.'),
         }),
         annotations: readOnlyAnnotations,
      },
      async ({ name }) => {
         if (name === undefined) {
            return createToolResponse(
               apgPatternListResultSchema.parse(listApgPatternSummaries()),
            );
         }
         return createToolResponse(
            apgLookupResultSchema.parse(showApgPatternOrExample(name)),
         );
      },
   );
}

function registerPatternFindTool(server: McpServer): void {
   server.registerTool(
      'pattern_find',
      {
         title: 'ARIA pattern find',
         description:
            'List the APG examples filed under one ARIA role (such as "combobox") or one property ' +
            'or state (such as "aria-expanded"). Use it to go from a role seen in an accessibility ' +
            'tree to the pattern that documents it. Give exactly one of role or attribute. Matches ' +
            'the CLI pattern role <role> and pattern attribute <attribute> commands.',
         inputSchema: z.object({
            role: z.string().min(1).optional(),
            attribute: z.string().min(1).optional(),
         }),
         annotations: readOnlyAnnotations,
      },
      async ({ role, attribute }) =>
         createToolResponse(
            apgFindResultSchema.parse(findApgExamples({ role, attribute })),
         ),
   );
}

/** Registers the ARIA pattern lookup tools. */
export function registerPatternTools(server: McpServer): void {
   registerPatternShowTool(server);
   registerPatternFindTool(server);
}
