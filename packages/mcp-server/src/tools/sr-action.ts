import {
   cliExitCodes,
   driverActionRequestSchema,
   driverActionResultSchema,
   type DriverActionRequest,
   type DriverActionResult,
} from '@a11ied/contracts';
import { runDriverSessionAction } from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
   activeAnnotations,
   createToolResponse,
   type ToolResponse,
} from '../lib/shared.js';

/** Actions whose `details.found` or `details.matched` is a pass/fail check, per the CLI. */
const VERDICT_ACTIONS = new Set(['find', 'goto', 'wait']);

interface SrActionResult extends DriverActionResult {
   exitCode: number;
}

/**
 * Attaches the same exit code the CLI would use: `find`, `goto`, and `wait` fail with
 * `cliExitCodes.assertion` when their `details.found` or `details.matched` is false.
 */
function attachExitCode(action: string, result: DriverActionResult): SrActionResult {
   const failed =
      VERDICT_ACTIONS.has(action) &&
      (result.details?.found === false || result.details?.matched === false);
   return { ...result, exitCode: failed ? cliExitCodes.assertion : cliExitCodes.success };
}

async function handleSrAction(
   input: DriverActionRequest,
): Promise<ToolResponse<Record<string, unknown>>> {
   const result = driverActionResultSchema.parse(await runDriverSessionAction(input));
   return createToolResponse({ ...attachExitCode(input.action, result) });
}

const SR_ACTION_DESCRIPTION =
   'Run one action against the active sr session, matching the CLI a1 sr subcommands. ' +
   'Start a session first with sr_session action "start". No session id is needed. ' +
   'Portable verbs (work on every target): next, previous, interact, stop-interacting, activate, ' +
   'top, bottom, escape, read, transcript, title. next/previous take an optional payload ' +
   '{ kind, level, times } to jump by kind: item (default), heading, link, landmark, control, ' +
   'button, table, list, graphic, region, form-field (matches a1 sr next/previous [kind]). ' +
   'press takes payload { keys }, one chord per entry, pressed in order (a1 sr press). ' +
   'type takes payload { text } (a1 sr type). checkpoint takes payload { label } (a1 sr checkpoint). ' +
   'perform takes payload { command, commandSet? } to run a named screen-reader command (a1 sr do). ' +
   'Use sr_list to find command names. focus takes payload { appName | bundleId | processName | pid | windowTitle, match? } ' +
   '(a1 sr focus). find takes payload { text } and moves to the next place it appears (a1 sr find). ' +
   'table takes payload { move } (a1 sr table). elements takes payload { kind, max? }, the rotor for one kind ' +
   '(a1 sr elements). read-all takes payload { max? }, say-all as a transcript (a1 sr read-all). ' +
   'goto takes payload { role?, name?, max? } and steps forward until the item matches (a1 sr goto). ' +
   'wait takes payload { for?, ms?, timeoutMs? } and polls the transcript for a phrase (a1 sr wait). ' +
   'screenshot takes payload { path }, VoiceOver cursor only (a1 sr screenshot). ' +
   'The result carries exitCode 4 (the CLI assertion exit code) when find, goto, or wait did not match, and 0 otherwise. ' +
   'For real screen reader sessions the response state carries axFocusedElement (VoiceOver only) and the full transcript so far.';

export function registerSrActionTool(server: McpServer): void {
   server.registerTool(
      'sr_action',
      {
         title: 'Screen reader action',
         description: SR_ACTION_DESCRIPTION,
         inputSchema: driverActionRequestSchema,
         annotations: activeAnnotations,
      },
      handleSrAction,
   );
}
