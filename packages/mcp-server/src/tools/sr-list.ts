import { platformSchema } from '@a11ied/contracts';
import {
   driverCommandSets,
   listDriverCommands,
   type ListDriverCommandsOptions,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createToolResponse, readOnlyAnnotations } from '../lib/shared.js';

const srListInputSchema = z.object({
   query: z
      .string()
      .min(1)
      .optional()
      .describe(
         'Keep only commands whose name, key sequence, or Commander phrase contains this text.',
      ),
   sr: platformSchema
      .optional()
      .describe('Filter by screen reader: voiceover, nvda, or virtual.'),
   commandSet: z
      .enum(driverCommandSets)
      .optional()
      .describe(
         'Command set: auto, portable, voiceover-commander, voiceover-keycode, or nvda-keycode.',
      ),
});
type SrListInput = z.infer<typeof srListInputSchema>;

function buildOptions(input: SrListInput): ListDriverCommandsOptions {
   const options: ListDriverCommandsOptions = {};
   if (input.sr) {
      options.target = input.sr;
   }
   if (input.commandSet) {
      options.commandSet = input.commandSet;
   }
   if (input.query) {
      options.query = input.query;
   }
   return options;
}

export function registerSrListTool(server: McpServer): void {
   server.registerTool(
      'sr_list',
      {
         title: 'Screen reader commands',
         description:
            'List the named commands sr_action\'s "perform" runs, grouped by command set and by what they do. ' +
            'Matches the CLI a1 sr list command. Start with query. The unfiltered list is over 400 entries. ' +
            'Run one with sr_action { action: "perform", payload: { command, commandSet } }.',
         inputSchema: srListInputSchema,
         annotations: readOnlyAnnotations,
      },
      async (input) => createToolResponse({ ...listDriverCommands(buildOptions(input)) }),
   );
}
