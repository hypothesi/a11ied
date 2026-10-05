import type {
   DriverActionName,
   DriverActionRequest,
   DriverStateSnapshot,
   DriverWaitPayload,
} from '@a11ied/contracts';
import type { DriverActionOptions } from '@a11ied/guidepup/browser';

import { executeAction, SPEECH_TRIGGERING_ACTIONS } from './broker-actions.js';
import type { ActionContext } from './broker-types.js';
import { runWaitAction } from './broker-wait.js';
import { withContextCommand } from './context-queue.js';
import type { TranscriptSelection } from './transcript-recorder.js';

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
   selection?: TranscriptSelection,
): Promise<DriverStateSnapshot> {
   const rawState = await context.adapter.readState(context.checkpoints);
   context.transcript.capture(rawState);
   return context.transcript.attach(rawState, selection);
}

/** Poll without monopolizing input; final observation and persistence stay serialized. */
export async function runContextWait<TResult>(
   context: ActionContext,
   payload: DriverWaitPayload,
   finish: (result: ContextActionResult) => Promise<TResult>,
): Promise<TResult> {
   const afterIndex = context.transcript.entries.at(-1)?.index ?? -1,
      startTime = Date.now();
   const execution = await runWaitAction(context, payload);
   return withContextCommand(context, async () => {
      const state = await captureContextState(context, { afterIndex });
      return finish({
         action: 'wait',
         state,
         details: execution.details,
         actionDurationMs: Date.now() - startTime,
      });
   });
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
   const afterIndex = context.transcript.entries.at(-1)?.index ?? -1,
      startTime = Date.now();
   const execution = await executeAction(context, request, options);
   if (SPEECH_TRIGGERING_ACTIONS.has(request.action)) {
      await context.adapter.waitForSpeechStabilization();
   }
   const selection = request.action === 'transcript' ? request.payload : { afterIndex };
   const state = await captureContextState(context, selection);
   return {
      action: request.action,
      state,
      details: execution.details,
      actionDurationMs: Date.now() - startTime,
   };
}
