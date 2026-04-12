import {
   accessibilityDriverSessionSchema,
   driverActionResultSchema,
   platformSchema,
} from '@a11ied/contracts';
import {
   attachDocumentToDriverSession,
   getDriverSessionStatus,
   resolveDefaultTarget,
   runDriverSessionAction,
   startDriverSession,
   stopDriverSession,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   activeAnnotations,
   createToolResponse,
   resolveExecutionTarget,
   targetInputSchema,
   type TargetInput,
} from '../lib/shared.js';

const driverStartInputSchema = z.object({
   target: platformSchema.optional(),
   url: z.string().url().optional(),
   storybookUrl: z.string().url().optional(),
   storyId: z.string().min(1).optional(),
});

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
]);

type DriverActionInput = z.infer<typeof driverActionInputSchema>;

function hasDocumentTarget(input: TargetInput): boolean {
   return (
      input.url !== undefined ||
      input.storybookUrl !== undefined ||
      input.storyId !== undefined
   );
}

async function attachResolvedDocument(
   sessionId: string,
   input: TargetInput,
): Promise<void> {
   if (!hasDocumentTarget(input)) {
      return;
   }

   const resolved = await resolveExecutionTarget(targetInputSchema.parse(input));
   await attachDocumentToDriverSession(sessionId, {
      html: resolved.html,
      url: resolved.resolvedUrl,
   });
}

function registerDriverStartTool(server: McpServer): void {
   server.registerTool(
      'driver_start_session',
      {
         title: 'Start driver session',
         description:
            'Start a persistent accessibility-driver session. ' +
            'On macOS the default target is VoiceOver (a real screen reader); on Windows it is NVDA (a real screen reader). ' +
            'If neither is available, the target falls back to "virtual", which is a SIMULATION — it models screen reader behavior in memory but does NOT test real assistive technology. ' +
            'The response includes a targetType field ("real" or "simulated") so you always know the fidelity of results. ' +
            'Prefer real screen readers whenever possible.',
         inputSchema: driverStartInputSchema,
         outputSchema: accessibilityDriverSessionSchema,
         annotations: activeAnnotations,
      },
      async ({ target, ...targetInput }) => {
         const resolvedTarget = target ?? resolveDefaultTarget().target;
         const session = await startDriverSession(resolvedTarget);
         await attachResolvedDocument(session.sessionId, targetInput);
         return createToolResponse(accessibilityDriverSessionSchema.parse(session));
      },
   );
}

function registerDriverGetTool(server: McpServer): void {
   server.registerTool(
      'driver_get_session',
      {
         title: 'Get driver session',
         description: 'Read driver session state and logs for an existing session.',
         inputSchema: z.object({
            sessionId: z.string().min(1),
         }),
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async ({ sessionId }) =>
         createToolResponse(
            driverActionResultSchema.parse(await getDriverSessionStatus(sessionId)),
         ),
   );
}

function registerDriverStopTool(server: McpServer): void {
   server.registerTool(
      'driver_stop_session',
      {
         title: 'Stop driver session',
         description:
            'Stop a persistent accessibility-driver session and remove its local session state.',
         inputSchema: z.object({
            sessionId: z.string().min(1),
         }),
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async ({ sessionId }) =>
         createToolResponse(
            driverActionResultSchema.parse(await stopDriverSession(sessionId)),
         ),
   );
}

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

   return runDriverSessionAction(input.sessionId, input.action);
}

function registerDriverActionTool(server: McpServer): void {
   server.registerTool(
      'driver_action',
      {
         title: 'Driver action',
         description:
            'Run one action against an accessibility-driver session. ' +
            'For real screen reader sessions (VoiceOver/NVDA), actions drive the actual assistive technology and return real speech output. ' +
            'For virtual sessions, actions are simulated in memory. ' +
            'Check the session targetType to know which mode is active. ' +
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

export function registerDriverTools(server: McpServer): void {
   registerDriverStartTool(server);
   registerDriverGetTool(server);
   registerDriverStopTool(server);
   registerDriverActionTool(server);
}
