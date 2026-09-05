import {
   driverActionRequestSchema,
   portableDriverVerbSchema,
   type DriverActionName,
   type DriverActionRequest,
   type DriverFocusTarget,
} from '@a11ied/contracts';
import { DriverCommandError, type DriverActionOptions } from '@a11ied/guidepup/browser';

import { CliUsageError } from '../errors/cli-errors.js';
import { runElementsAction, runGotoAction, runReadAllAction } from './broker-loops.js';
import { runWaitAction } from './broker-wait.js';
import type { ActionContext, ActionExecutionResult } from './broker-types.js';

/** Actions after which the broker waits for the reader to finish speaking. */
export const SPEECH_TRIGGERING_ACTIONS: ReadonlySet<DriverActionName> =
   new Set<DriverActionName>([
      ...portableDriverVerbSchema.options,
      'press',
      'type',
      'perform',
      'title',
      'find',
      'table',
      'elements',
      'read-all',
      'goto',
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
   context: ActionContext,
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
   context: ActionContext,
   request: Extract<DriverActionRequest, { action: 'perform' }>,
   options: DriverActionOptions,
): Promise<ActionExecutionResult> {
   const performed = await context.adapter.performCommand(request.payload, options);
   return { details: { command: performed } };
}

/**
 * Runs `next` and `previous`. A bare verb is the reader's own next-item step; a payload
 * jumps by kind through the navigation table.
 */
async function handleNavigate(
   context: ActionContext,
   request: Extract<DriverActionRequest, { action: 'next' | 'previous' }>,
   options: DriverActionOptions,
): Promise<ActionExecutionResult> {
   if (!request.payload) {
      await context.adapter.performPortable(request.action, options);
      return {};
   }
   const navigation = { direction: request.action, ...request.payload };
   const outcome = await context.adapter.navigate(navigation, options);
   return { details: { navigation, ...outcome } };
}

/** Runs title, find, and table, each of which reports its outcome in the details. */
async function handleStructure(
   context: ActionContext,
   request: DriverActionRequest,
   options: DriverActionOptions,
): Promise<ActionExecutionResult> {
   if (request.action === 'find') {
      const outcome = await context.adapter.findText(request.payload.text, options);
      return { details: { text: request.payload.text, ...outcome } };
   }
   if (request.action === 'table') {
      const outcome = await context.adapter.moveInTable(request.payload.move, options);
      return { details: { move: request.payload.move, ...outcome } };
   }
   return { details: await context.adapter.readTitle(options) };
}

/** Runs the bounded loops: the rotor, say-all, and goto. */
async function handleLoop(
   context: ActionContext,
   request: Extract<DriverActionRequest, { action: 'elements' | 'read-all' | 'goto' }>,
   options: DriverActionOptions,
): Promise<ActionExecutionResult> {
   if (request.action === 'elements') {
      return runElementsAction(context.adapter, request.payload, options);
   }
   if (request.action === 'read-all') {
      return runReadAllAction(context.adapter, request.payload, options);
   }
   return runGotoAction(context.adapter, request.payload, options);
}

/** Runs wait and screenshot, which observe the reader without moving its cursor. */
async function handleObservation(
   context: ActionContext,
   request: Extract<DriverActionRequest, { action: 'wait' | 'screenshot' }>,
   options: DriverActionOptions,
): Promise<ActionExecutionResult> {
   if (request.action === 'wait') {
      return runWaitAction(context, request.payload);
   }
   const saved = await context.adapter.captureCursorScreenshot(
      request.payload.path,
      options,
   );
   return { details: { screenshot: saved.path, source: saved.source } };
}

function recordCheckpoint(context: ActionContext, label: string): ActionExecutionResult {
   const createdAt = new Date().toISOString();
   context.checkpoints.push({ label, createdAt });
   context.transcript.addCheckpoint(label, createdAt);
   return { details: { label } };
}

async function handleFocus(
   context: ActionContext,
   payload: DriverFocusTarget | undefined,
): Promise<ActionExecutionResult> {
   const focusResult = await context.adapter.focus(resolveFocusTarget(context, payload));
   return { details: { focus: focusResult } };
}

async function dispatchAction(
   context: ActionContext,
   request: DriverActionRequest,
   options: DriverActionOptions,
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
      case 'next':
      case 'previous': {
         return handleNavigate(context, request, options);
      }
      case 'title':
      case 'find':
      case 'table': {
         return handleStructure(context, request, options);
      }
      case 'elements':
      case 'read-all':
      case 'goto': {
         return handleLoop(context, request, options);
      }
      case 'wait':
      case 'screenshot': {
         return handleObservation(context, request, options);
      }
      default: {
         await context.adapter.performPortable(request.action, options);
         return {};
      }
   }
}

/**
 * Executes one typed action. Adapter errors that name an unsupported combination of
 * target and command come back as usage errors, so the CLI exits 2 with the message.
 */
export async function executeAction(
   context: ActionContext,
   request: DriverActionRequest,
   options: DriverActionOptions = {},
): Promise<ActionExecutionResult> {
   try {
      return await dispatchAction(context, request, options);
   } catch (error) {
      if (error instanceof DriverCommandError) {
         throw new CliUsageError(error.code, error.message, error.details);
      }
      throw error;
   }
}
