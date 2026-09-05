import { cliExitCodes, driverTranscriptFormatSchema } from '@a11ied/contracts';
import {
   buildDriverTranscript,
   describeExpectationFailure,
   evaluateExpectation,
   parseTextMatcher,
   resolveTranscriptFormat,
   runDriverSessionAction,
   selectTranscriptEntries,
   writeDriverTranscript,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   activeAnnotations,
   createToolResponse,
   readOnlyAnnotations,
   type ToolResponse,
} from '../lib/shared.js';

const srExpectInputSchema = z.object({
   pattern: z
      .string()
      .min(1)
      .describe('Text (case-insensitive) or /regex/flags to match.'),
   since: z
      .string()
      .min(1)
      .optional()
      .describe('Only count phrases after this checkpoint label.'),
   not: z.boolean().optional().describe('Pass when the phrase was not announced.'),
   timeoutMs: z.number().int().positive().optional(),
});

async function handleSrExpect(
   input: z.infer<typeof srExpectInputSchema>,
): Promise<ToolResponse<Record<string, unknown>>> {
   const matcher = parseTextMatcher(input.pattern),
      result = await runDriverSessionAction(
         { action: 'transcript' },
         { timeoutMs: input.timeoutMs },
      );
   const expectation = evaluateExpectation(result.state.transcript, {
      matcher,
      since: input.since,
      not: input.not,
   });
   const payload: Record<string, unknown> = {
      session: result.session,
      expectation,
      exitCode: expectation.passed ? cliExitCodes.success : cliExitCodes.assertion,
   };
   if (!expectation.passed) {
      payload.message = describeExpectationFailure(expectation);
   }
   return createToolResponse(payload);
}

function registerSrExpectTool(server: McpServer): void {
   server.registerTool(
      'sr_expect',
      {
         title: 'Screen reader expect',
         description:
            'Check that the active sr session announced a phrase matching pattern (text, ignoring case, ' +
            'or /regex/flags). Matches the CLI a1 sr expect command. since limits the check to phrases ' +
            'after that checkpoint label. Set not to true to pass when the phrase was NOT announced instead. ' +
            'The result carries exitCode 4 (the CLI assertion exit code) and a message when the check failed, and exitCode 0 when it passed.',
         inputSchema: srExpectInputSchema,
         annotations: activeAnnotations,
      },
      handleSrExpect,
   );
}

const srTranscriptInputSchema = z.object({
   since: z
      .string()
      .min(1)
      .optional()
      .describe('Only entries after this checkpoint label.'),
   tail: z.number().int().positive().optional().describe('Only the last N phrases.'),
   out: z
      .string()
      .min(1)
      .optional()
      .describe('Also write the transcript to this .json or .md path.'),
   format: driverTranscriptFormatSchema
      .optional()
      .describe('Transcript format. Defaults to the out extension.'),
   timeoutMs: z.number().int().positive().optional(),
});

async function handleSrTranscript(
   input: z.infer<typeof srTranscriptInputSchema>,
): Promise<ToolResponse<Record<string, unknown>>> {
   if (input.out) {
      resolveTranscriptFormat(input.out, input.format);
   }
   const result = await runDriverSessionAction(
      { action: 'transcript' },
      { timeoutMs: input.timeoutMs },
   );
   const entries = selectTranscriptEntries(result.state.transcript, {
      since: input.since,
      tail: input.tail,
   });
   const transcript = buildDriverTranscript(result.session, entries);
   const file = input.out
      ? await writeDriverTranscript({
           transcript,
           outPath: input.out,
           format: input.format,
        })
      : undefined;
   return createToolResponse({ session: result.session, transcript, file });
}

function registerSrTranscriptTool(server: McpServer): void {
   server.registerTool(
      'sr_transcript',
      {
         title: 'Screen reader transcript',
         description:
            "Print what the active sr session's reader said, with timestamps and checkpoints. " +
            'Matches the CLI a1 sr transcript command. since keeps only entries after that checkpoint label. ' +
            'tail keeps only the last N phrases. out also writes the transcript to a .json or .md path.',
         inputSchema: srTranscriptInputSchema,
         annotations: readOnlyAnnotations,
      },
      handleSrTranscript,
   );
}

export function registerSrTranscriptTools(server: McpServer): void {
   registerSrExpectTool(server);
   registerSrTranscriptTool(server);
}
