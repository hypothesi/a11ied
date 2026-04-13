import {
   accessibilityDriverSessionSchema,
   driverActionResultSchema,
   driverFocusTargetFieldsSchema,
   driverFocusTargetRefinement,
   platformSchema,
   type Platform,
} from '@a11ied/contracts';
import {
   attachDocumentToDriverSession,
   getDriverSessionStatus,
   resolveDefaultTarget,
   resolveTargetType,
   runDriverSessionAction,
   startDriverSession,
   stopDriverSession,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   activeAnnotations,
   createToolResponse,
   ensureVirtualTargetAllowed,
   resolveExecutionTarget,
   targetInputSchema,
   type ToolResponse,
   type TargetInput,
} from '../lib/shared.js';

/* ------------------------------------------------------------------ */
/*  Driver session — unified start / status / stop                    */
/* ------------------------------------------------------------------ */

const driverSessionInputSchema = z.object({
   action: z.enum(['start', 'status', 'stop']),
   sessionId: z.string().min(1).optional(),
   target: platformSchema.optional(),
   allowVirtual: z.boolean().optional(),
   url: z.string().url().optional(),
});

/* ------------------------------------------------------------------ */
/*  Driver action — per-session action dispatch                       */
/* ------------------------------------------------------------------ */

const driverActionInputSchema = z.discriminatedUnion('action', [
   z.object({
      sessionId: z.string().min(1),
      action: z.literal('next'),
   }),
   z.object({
      sessionId: z.string().min(1),
      action: z.literal('previous'),
   }),
   z.object({
      sessionId: z.string().min(1),
      action: z.literal('interact'),
   }),
   z.object({
      sessionId: z.string().min(1),
      action: z.literal('stop-interacting'),
   }),
   z.object({
      sessionId: z.string().min(1),
      action: z.literal('click-current-item'),
   }),
   z.object({
      sessionId: z.string().min(1),
      action: z.literal('read'),
   }),
   z.object({
      sessionId: z.string().min(1),
      action: z.literal('logs'),
   }),
   z.object({
      sessionId: z.string().min(1),
      action: z.literal('clear-logs'),
   }),
   z.object({
      sessionId: z.string().min(1),
      action: z.literal('key'),
      key: z.string().min(1),
   }),
   z.object({
      sessionId: z.string().min(1),
      action: z.literal('type'),
      text: z.string(),
   }),
   z.object({
      sessionId: z.string().min(1),
      action: z.literal('checkpoint'),
      label: z.string().min(1),
   }),
   driverFocusTargetFieldsSchema
      .extend({
         sessionId: z.string().min(1),
         action: z.literal('focus'),
      })
      .superRefine(driverFocusTargetRefinement),
]);

type DriverActionInput = z.infer<typeof driverActionInputSchema>;
type DriverSessionInput = z.infer<typeof driverSessionInputSchema>;
type DriverSessionToolResponse = ToolResponse<Record<string, unknown>>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function hasDocumentTarget(input: TargetInput): boolean {
   return input.url !== undefined;
}

async function attachResolvedDocument(
   sessionId: string,
   input: TargetInput,
   target: Platform,
): Promise<void> {
   // Real screen readers use the host environment browser; the agent must
   // Navigate to the page. Document attachment only applies to the virtual target.
   if (resolveTargetType(target) === 'real') {
      return;
   }
   if (!hasDocumentTarget(input)) {
      return;
   }

   const resolved = await resolveExecutionTarget(targetInputSchema.parse(input));
   await attachDocumentToDriverSession(sessionId, {
      html: resolved.html,
      url: resolved.resolvedUrl,
   });
}

function requireSessionId(input: DriverSessionInput): string {
   if (!input.sessionId) {
      throw new Error('sessionId is required for status and stop actions');
   }
   return input.sessionId;
}

async function handleDriverSessionStart(
   input: DriverSessionInput,
): Promise<DriverSessionToolResponse> {
   const {
      target,
      action: _action,
      sessionId: _sessionId,
      allowVirtual: _allowVirtual,
      ...targetInput
   } = input;
   const resolvedTarget = target ?? resolveDefaultTarget().target;
   ensureVirtualTargetAllowed(resolvedTarget, input.allowVirtual);
   const session = await startDriverSession(resolvedTarget);
   await attachResolvedDocument(session.sessionId, targetInput, resolvedTarget);
   return createToolResponse<Record<string, unknown>>(
      accessibilityDriverSessionSchema.parse(session),
   );
}

async function handleDriverSessionStatus(
   input: DriverSessionInput,
): Promise<DriverSessionToolResponse> {
   const sessionId = requireSessionId(input);
   return createToolResponse<Record<string, unknown>>(
      driverActionResultSchema.parse(await getDriverSessionStatus(sessionId)),
   );
}

async function handleDriverSessionStop(
   input: DriverSessionInput,
): Promise<DriverSessionToolResponse> {
   const sessionId = requireSessionId(input);
   return createToolResponse<Record<string, unknown>>(
      driverActionResultSchema.parse(await stopDriverSession(sessionId)),
   );
}

const driverSessionHandlers: Record<
   DriverSessionInput['action'],
   (input: DriverSessionInput) => Promise<DriverSessionToolResponse>
> = {
   start: handleDriverSessionStart,
   status: handleDriverSessionStatus,
   stop: handleDriverSessionStop,
};

async function runDriverAction(input: DriverActionInput): Promise<unknown> {
   if (input.action === 'key') {
      return runDriverSessionAction(input.sessionId, 'key', {
         payload: { key: input.key },
      });
   }

   if (input.action === 'type') {
      return runDriverSessionAction(input.sessionId, 'type', {
         payload: { text: input.text },
      });
   }

   if (input.action === 'checkpoint') {
      return runDriverSessionAction(input.sessionId, 'checkpoint', {
         payload: { label: input.label },
      });
   }

   if (input.action === 'focus') {
      const { sessionId, action: _action, ...focusTarget } = input;
      return runDriverSessionAction(sessionId, 'focus', {
         payload: focusTarget,
      });
   }

   return runDriverSessionAction(input.sessionId, input.action);
}

/* ------------------------------------------------------------------ */
/*  Registration                                                      */
/* ------------------------------------------------------------------ */

export function registerDriverTools(server: McpServer): void {
   server.registerTool(
      'driver_session',
      {
         title: 'Driver session',
         description:
            'Manage accessibility-driver sessions. ' +
            'action "start": create a new session (returns sessionId and targetType). ' +
            'action "status": read current session state and logs. ' +
            'action "stop": tear down the session. ' +
            'On macOS the default target is VoiceOver (real); on Windows it is NVDA (real). ' +
            'If neither is available, the target falls back to "virtual" (SIMULATION). ' +
            'Only request the virtual target when you explicitly want simulation; set allowVirtual=true to proceed. ' +
            'The response includes a targetType field ("real" or "simulated"). ' +
            'For real screen readers: open a browser and navigate to the page BEFORE starting. ' +
            'For virtual: pass url and a11ied injects HTML automatically.',
         inputSchema: driverSessionInputSchema,
         annotations: activeAnnotations,
      },
      async (input) => driverSessionHandlers[input.action](input),
   );

   server.registerTool(
      'driver_action',
      {
         title: 'Driver action',
         description:
            'Run one action against an accessibility-driver session. ' +
            'For real screen reader sessions (VoiceOver/NVDA), actions drive the actual assistive technology and return real speech output. ' +
            'For virtual sessions, actions are simulated in memory. ' +
            'Check the session targetType to know which mode is active. ' +
            'Use action "focus" with appName, bundleId, processName, pid, or windowTitle to bring the target window to the front. ' +
            'The response includes actionDurationMs showing how long the operation took.',
         inputSchema: driverActionInputSchema,
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            driverActionResultSchema.parse(
               await runDriverAction(input as DriverActionInput),
            ),
         ),
   );
}
