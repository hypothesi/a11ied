import {
   driverFocusTargetSchema,
   type DriverActionResult,
   type DriverCheckpoint,
   type DriverFocusTarget,
} from '@a11ied/contracts';
import type { createDriverAdapter } from '@a11ied/guidepup';

import { CliUsageError } from '../errors/cli-errors.js';
import type { ActionContext, ActionExecutionResult } from './broker-types.js';

const SPEECH_TRIGGERING_ACTIONS = new Set([
   'next',
   'previous',
   'key',
   'type',
   'interact',
   'stop-interacting',
   'click-current-item',
]);

const BROKER_NO_OP_ACTIONS = new Set(['read', 'logs', 'attach-document']);

function getSimpleActionHandler(
   adapter: ReturnType<typeof createDriverAdapter>,
   action: DriverActionResult['action'] | undefined,
): (() => Promise<void>) | undefined {
   const handlers: Record<string, () => Promise<void>> = {
      next: () => adapter.next(),
      previous: () => adapter.previous(),
      interact: () => adapter.interact(),
      'stop-interacting': () => adapter.stopInteracting(),
      'click-current-item': () => adapter.activateCurrentItem(),
   };
   return handlers[String(action)];
}

function addCheckpoint(
   checkpoints: DriverCheckpoint[],
   payload?: Record<string, unknown>,
): void {
   checkpoints.push({
      label: String(payload?.label ?? 'checkpoint'),
      createdAt: new Date().toISOString(),
   });
}

function createPayloadResult(payload?: Record<string, unknown>): ActionExecutionResult {
   if (payload) {
      return { handled: true, details: payload };
   }
   return { handled: true };
}

async function handleKeyAction(
   context: ActionContext,
   payload?: Record<string, unknown>,
): Promise<ActionExecutionResult> {
   await context.adapter.press(String(payload?.keys ?? ''));
   return createPayloadResult(payload);
}

async function handleTypeAction(
   context: ActionContext,
   payload?: Record<string, unknown>,
): Promise<ActionExecutionResult> {
   await context.adapter.type(String(payload?.text ?? ''));
   return createPayloadResult(payload);
}

async function handleClearLogsAction(
   context: ActionContext,
   payload?: Record<string, unknown>,
): Promise<ActionExecutionResult> {
   await context.adapter.clearLogs(context.checkpoints);
   return createPayloadResult(payload);
}

async function handleCheckpointAction(
   context: ActionContext,
   payload?: Record<string, unknown>,
): Promise<ActionExecutionResult> {
   addCheckpoint(context.checkpoints, payload);
   return createPayloadResult(payload);
}

function parseFocusTarget(payload?: Record<string, unknown>): DriverFocusTarget {
   const parsed = driverFocusTargetSchema.safeParse(payload ?? {});
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         'Provide appName, bundleId, processName, pid, or windowTitle to focus.',
         {
            field: 'focus',
            issues: parsed.error.issues,
         },
      );
   }
   return parsed.data;
}

async function handleFocusAction(
   context: ActionContext,
   payload?: Record<string, unknown>,
): Promise<ActionExecutionResult> {
   const focusTarget = parseFocusTarget(payload);
   const focusResult = await context.adapter.focus(focusTarget);
   return {
      handled: true,
      details: {
         focus: focusResult,
      },
   };
}

const payloadActionHandlers: Record<
   string,
   (
      context: ActionContext,
      payload?: Record<string, unknown>,
   ) => Promise<ActionExecutionResult>
> = {
   key: handleKeyAction,
   type: handleTypeAction,
   'clear-logs': handleClearLogsAction,
   checkpoint: handleCheckpointAction,
   focus: handleFocusAction,
};

async function executePayloadAction(
   context: ActionContext,
   action: DriverActionResult['action'] | undefined,
   payload?: Record<string, unknown>,
): Promise<ActionExecutionResult> {
   const handler = payloadActionHandlers[String(action)];
   if (!handler) {
      return { handled: false };
   }
   return await handler(context, payload);
}

export async function executeAction(
   context: ActionContext,
   action: DriverActionResult['action'] | undefined,
   payload?: Record<string, unknown>,
): Promise<ActionExecutionResult> {
   const simpleHandler = getSimpleActionHandler(context.adapter, action);
   if (simpleHandler) {
      await simpleHandler();
      return { handled: true };
   }
   return await executePayloadAction(context, action, payload);
}

export function isUnknownAction(
   action: DriverActionResult['action'],
   handled: boolean,
): boolean {
   return !handled && !BROKER_NO_OP_ACTIONS.has(String(action));
}

export async function maybeStabilizeSpeech(
   adapter: ActionContext['adapter'],
   action: DriverActionResult['action'],
   handled: boolean,
): Promise<void> {
   if (handled && SPEECH_TRIGGERING_ACTIONS.has(String(action))) {
      await adapter.waitForSpeechStabilization();
   }
}
