import {
   driverActionRequestSchema,
   portableDriverVerbSchema,
   type DriverActionName,
   type DriverActionRequest,
   type DriverFocusTarget,
} from '@a11ied/contracts';
import { DriverCommandError, type DriverActionOptions } from '@a11ied/guidepup';

import { CliUsageError } from '../errors/cli-errors.js';
import type { ActionExecutionResult, BrokerHandlerContext } from './broker-types.js';

/** Actions after which the broker waits for the reader to finish speaking. */
export const SPEECH_TRIGGERING_ACTIONS: ReadonlySet<DriverActionName> =
   new Set<DriverActionName>([
      ...portableDriverVerbSchema.options,
      'press',
      'type',
      'perform',
   ]);

/** Validates a raw broker action and payload into the typed request union. */
export function parseActionRequest(
   action: DriverActionName | undefined,
   payload: Record<string, unknown> | undefined,
): DriverActionRequest {
   const parsed = driverActionRequestSchema.safeParse({
      action: action ?? 'read',
      payload,
   });
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         `Driver action "${String(action)}" received an invalid payload.`,
         { action, issues: parsed.error.issues },
      );
   }
   return parsed.data;
}

function resolveFocusTarget(
   context: BrokerHandlerContext,
   payload: DriverFocusTarget | undefined,
): DriverFocusTarget {
   if (payload) {
      return payload;
   }
   if (context.session.app) {
      return context.session.app;
   }
   throw new CliUsageError(
      'validation-error',
      'This session did not open an app. Pass --app, --bundle-id, --process, --pid, or --window-title.',
      { field: 'focus' },
   );
}

async function handlePerform(
   context: BrokerHandlerContext,
   request: Extract<DriverActionRequest, { action: 'perform' }>,
   options: DriverActionOptions,
): Promise<ActionExecutionResult> {
   try {
      const performed = await context.adapter.performCommand(request.payload, options);
      return { details: { command: performed } };
   } catch (error) {
      if (error instanceof DriverCommandError) {
         throw new CliUsageError(error.code, error.message, error.details);
      }
      throw error;
   }
}

function recordCheckpoint(
   context: BrokerHandlerContext,
   label: string,
): ActionExecutionResult {
   const createdAt = new Date().toISOString();
   context.checkpoints.push({ label, createdAt });
   context.transcript.addCheckpoint(label, createdAt);
   return { details: { label } };
}

async function handleFocus(
   context: BrokerHandlerContext,
   payload: DriverFocusTarget | undefined,
): Promise<ActionExecutionResult> {
   const focusResult = await context.adapter.focus(resolveFocusTarget(context, payload));
   return { details: { focus: focusResult } };
}

/** Executes one typed action against the session adapter. */
export async function executeAction(
   context: BrokerHandlerContext,
   request: DriverActionRequest,
   options: DriverActionOptions = {},
): Promise<ActionExecutionResult> {
   switch (request.action) {
      case 'press': {
         await context.adapter.press(request.payload.keys, options);
         return { details: request.payload };
      }
      case 'type': {
         await context.adapter.type(request.payload.text, options);
         return { details: request.payload };
      }
      case 'perform': {
         return handlePerform(context, request, options);
      }
      case 'checkpoint': {
         return recordCheckpoint(context, request.payload.label);
      }
      case 'focus': {
         return handleFocus(context, request.payload);
      }
      case 'read':
      case 'transcript': {
         return {};
      }
      default: {
         await context.adapter.performPortable(request.action, options);
         return {};
      }
   }
}
