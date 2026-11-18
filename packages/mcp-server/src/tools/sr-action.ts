import {
   cliExitCodes,
   driverActionRequestSchema,
   driverActionResultSchema,
   type DriverActionRequest,
   type DriverActionResult,
} from '@a11ied/contracts';
import { runDriverSessionAction } from '@a11ied/core';
import { generateSrActionDescription, SR_ACTION_ENUM_VALUES } from '@a11ied/guidepup';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   activeAnnotations,
   createToolResponse,
   type ToolResponse,
} from '../lib/shared.js';

export const srActionEnum = z.enum(SR_ACTION_ENUM_VALUES);
export type SrActionEnum = z.infer<typeof srActionEnum>;

export const srActionInputSchema = z.object({
   action: srActionEnum.describe(
      'Screen reader action: next, previous, navigate, act, press, type, perform, click, interact, stopInteracting, takeSnapshot.',
   ),
   payload: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
         'Optional action payload (e.g. kind, keys, text, command, role, name, max, path).',
      ),
});
export type SrActionInput = z.infer<typeof srActionInputSchema>;

export const srActionToolInputSchema = srActionInputSchema.or(driverActionRequestSchema);

export const SR_ACTION_DESCRIPTION = generateSrActionDescription();

/** Actions whose `details.found` or `details.matched` is a pass/fail check, per the CLI. */
const VERDICT_ACTIONS = new Set(['find', 'goto', 'wait', 'navigate']);
const DEFAULT_MAX_STEPS = 500;

interface SrActionResult extends DriverActionResult {
   exitCode: number;
}

/**
 * Attaches the same exit code the CLI would use: `find`, `goto`, `wait`, and `navigate`
 * fail with `cliExitCodes.assertion` when their `details.found` or `details.matched` is
 * false.
 */
function attachExitCode(action: string, result: DriverActionResult): SrActionResult {
   const failed =
      VERDICT_ACTIONS.has(action) &&
      (result.details?.found === false || result.details?.matched === false);
   return { ...result, exitCode: failed ? cliExitCodes.assertion : cliExitCodes.success };
}

function normalizeActionInput(rawInput: unknown): DriverActionRequest {
   const req = rawInput as { action: string; payload?: Record<string, unknown> };
   switch (req.action) {
      case 'navigate': {
         const payload = (req.payload ?? {}) as {
            role?: string;
            name?: string;
            max?: number;
         };
         return {
            action: 'goto',
            payload: {
               role: payload.role,
               name: payload.name,
               max: payload.max ?? DEFAULT_MAX_STEPS,
            },
         };
      }
      case 'act':
      case 'click': {
         return { action: 'activate' };
      }
      case 'stopInteracting': {
         return { action: 'stop-interacting' };
      }
      case 'takeSnapshot': {
         const payload = (req.payload ?? {}) as { path?: string };
         return {
            action: 'screenshot',
            payload: { path: payload.path ?? 'screenshot.png' },
         };
      }
      default: {
         return rawInput as DriverActionRequest;
      }
   }
}

async function handleSrAction(
   input: unknown,
): Promise<ToolResponse<Record<string, unknown>>> {
   const normalized = normalizeActionInput(input);
   const result = driverActionResultSchema.parse(
      await runDriverSessionAction(normalized),
   );
   const requestedAction = (input as { action?: string })?.action ?? normalized.action;
   return createToolResponse({ ...attachExitCode(requestedAction, result) });
}

export function registerSrActionTool(server: McpServer): void {
   server.registerTool(
      'sr_action',
      {
         title: 'Screen reader action',
         description: SR_ACTION_DESCRIPTION,
         inputSchema: srActionToolInputSchema,
         annotations: activeAnnotations,
      },
      handleSrAction,
   );
}
