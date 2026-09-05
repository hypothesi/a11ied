import type {
   DriverActionName,
   DriverActionRequest,
   DriverStateSnapshot,
} from '@a11ied/contracts';
import type { DriverActionOptions } from '@a11ied/guidepup/browser';

import { executeAction, SPEECH_TRIGGERING_ACTIONS } from './broker-actions.js';
import type { ActionContext } from './broker-types.js';

/** What one action produced: the state after it and the details it reported. */
export interface ContextActionResult {
   action: DriverActionName;
   state: DriverStateSnapshot;
   details?: Record<string, unknown> | undefined;
   actionDurationMs: number;
}

/**
 * Reads the adapter state and stamps every new phrase into the transcript, so each one
 * carries the time the action that produced it finished.
 */
export async function captureContextState(
   context: ActionContext,
): Promise<DriverStateSnapshot> {
   const rawState = await context.adapter.readState(context.checkpoints);
   context.transcript.capture(rawState);
   return context.transcript.attach(rawState);
}

/**
 * Runs one typed action: executes it, waits for speech to settle after the actions that
 * speak, and captures the state. The broker and the test runners share it.
 */
export async function runContextAction(
   context: ActionContext,
   request: DriverActionRequest,
   options: DriverActionOptions = {},
): Promise<ContextActionResult> {
   const startTime = Date.now();
   const execution = await executeAction(context, request, options);
   if (SPEECH_TRIGGERING_ACTIONS.has(request.action)) {
      await context.adapter.waitForSpeechStabilization();
   }
   const state = await captureContextState(context);
   return {
      action: request.action,
      state,
      details: execution.details,
      actionDurationMs: Date.now() - startTime,
   };
}
