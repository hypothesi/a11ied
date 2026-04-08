import {
   accessibilityDriverSessionSchema,
   driverActionResultSchema,
   platformSchema,
} from '@a11lied/contracts';
import {
   attachDocumentToDriverSession,
   getDriverSessionStatus,
   runDriverSessionAction,
   startDriverSession,
   stopDriverSession,
} from '@a11lied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   activeAnnotations,
   createToolResponse,
   resolveExecutionTarget,
   targetInputSchema,
   type TargetInput,
} from '../lib/shared.js';

type SimpleDriverAction =
   | 'next'
   | 'previous'
   | 'interact'
   | 'stop-interacting'
   | 'click-current-item'
   | 'read'
   | 'logs'
   | 'clear-logs';

interface SimpleDriverToolDefinition {
   name: string;
   action: SimpleDriverAction;
   description: string;
}

const driverStartInputSchema = z.object({
   target: platformSchema.default('virtual'),
   url: z.string().url().optional(),
   storybookUrl: z.string().url().optional(),
   storyId: z.string().min(1).optional(),
});

const simpleDriverTools: SimpleDriverToolDefinition[] = [
   {
      name: 'driver_next_item',
      action: 'next',
      description:
         'Move to the next item in the current accessibility-driver session. This may drive assistive technology.',
   },
   {
      name: 'driver_previous_item',
      action: 'previous',
      description:
         'Move to the previous item in the current accessibility-driver session. This may drive assistive technology.',
   },
   {
      name: 'driver_interact',
      action: 'interact',
      description:
         'Enter interaction mode in the current accessibility-driver session. This may drive assistive technology.',
   },
   {
      name: 'driver_stop_interacting',
      action: 'stop-interacting',
      description:
         'Leave interaction mode in the current accessibility-driver session. This may drive assistive technology.',
   },
   {
      name: 'driver_click_current_item',
      action: 'click-current-item',
      description:
         'Activate the current item in the accessibility-driver session. This may drive assistive technology.',
   },
   {
      name: 'driver_read',
      action: 'read',
      description:
         'Read the current driver snapshot, including spoken and item-text logs.',
   },
   {
      name: 'driver_logs',
      action: 'logs',
      description: 'Read the current spoken and item-text logs for a driver session.',
   },
   {
      name: 'driver_clear_logs',
      action: 'clear-logs',
      description: 'Clear accumulated spoken and item-text logs for a driver session.',
   },
];

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
            'Start a persistent accessibility-driver session. This may launch or drive assistive technology and persist local session state.',
         inputSchema: driverStartInputSchema,
         outputSchema: accessibilityDriverSessionSchema,
         annotations: activeAnnotations,
      },
      async ({ target, ...targetInput }) => {
         const session = await startDriverSession(target);
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

function registerSimpleDriverTool(
   server: McpServer,
   definition: SimpleDriverToolDefinition,
): void {
   server.registerTool(
      definition.name,
      {
         title: definition.name,
         description: definition.description,
         inputSchema: z.object({
            sessionId: z.string().min(1),
         }),
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async ({ sessionId }) =>
         createToolResponse(
            driverActionResultSchema.parse(
               await runDriverSessionAction(sessionId, definition.action),
            ),
         ),
   );
}

function registerDriverKeyTool(server: McpServer): void {
   server.registerTool(
      'driver_key',
      {
         title: 'Send key',
         description:
            'Send a key chord through the current accessibility-driver session. This may drive assistive technology.',
         inputSchema: z.object({
            sessionId: z.string().min(1),
            key: z.string().min(1),
         }),
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async ({ sessionId, key }) =>
         createToolResponse(
            driverActionResultSchema.parse(
               await runDriverSessionAction(sessionId, 'key', {
                  payload: { key },
               }),
            ),
         ),
   );
}

function registerDriverTypeTool(server: McpServer): void {
   server.registerTool(
      'driver_type',
      {
         title: 'Type text',
         description:
            'Type text through the current accessibility-driver session. This may drive assistive technology.',
         inputSchema: z.object({
            sessionId: z.string().min(1),
            text: z.string(),
         }),
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async ({ sessionId, text }) =>
         createToolResponse(
            driverActionResultSchema.parse(
               await runDriverSessionAction(sessionId, 'type', {
                  payload: { text },
               }),
            ),
         ),
   );
}

function registerDriverCheckpointTool(server: McpServer): void {
   server.registerTool(
      'driver_checkpoint',
      {
         title: 'Create checkpoint',
         description:
            'Create a named checkpoint in the current accessibility-driver session.',
         inputSchema: z.object({
            sessionId: z.string().min(1),
            label: z.string().min(1),
         }),
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async ({ sessionId, label }) =>
         createToolResponse(
            driverActionResultSchema.parse(
               await runDriverSessionAction(sessionId, 'checkpoint', {
                  payload: { label },
               }),
            ),
         ),
   );
}

export function registerDriverTools(server: McpServer): void {
   registerDriverStartTool(server);
   registerDriverGetTool(server);
   registerDriverStopTool(server);
   for (const definition of simpleDriverTools) {
      registerSimpleDriverTool(server, definition);
   }
   registerDriverKeyTool(server);
   registerDriverTypeTool(server);
   registerDriverCheckpointTool(server);
}
