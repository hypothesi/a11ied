import type {
   DriverActionRequest,
   DriverActionResult,
   Platform,
} from '@a11ied/contracts';

import { ignoreError } from '@a11ied/guidepup';

import { handleBrokerRequest } from './broker-handlers.js';
import { startSessionRecording } from './recording.js';
import { parseBrokerActionResult } from './runtime-support.js';
import { createDriverSessionContext } from './session-context.js';
import { createSessionId } from './session-utils.js';

export interface EphemeralActionOptions {
   target: Platform;
   request: DriverActionRequest;
   recordingPath?: string | undefined;
   timeoutMs?: number | undefined;
}

/**
 * Runs one action in a session that never touches the state directory and stops right
 * after.
 */
export async function runEphemeralAction(
   options: EphemeralActionOptions,
): Promise<DriverActionResult> {
   const sessionId = `ephemeral_${createSessionId()}`;
   const recording = options.recordingPath
      ? startSessionRecording(options.target, options.recordingPath)
      : undefined;
   const { adapter, context } = await createDriverSessionContext({
      target: options.target,
      sessionId,
      metadataFile: `ephemeral://${sessionId}`,
      socketPath: `ephemeral://${sessionId}`,
      recording,
      persist: false,
   });
   try {
      const handled = await handleBrokerRequest(context, {
         command: 'action',
         action: options.request.action,
         payload: 'payload' in options.request ? options.request.payload : undefined,
         timeoutMs: options.timeoutMs,
      });
      const result = parseBrokerActionResult({
         actionErrorMessage: `Could not run driver action "${options.request.action}".`,
         response: handled.response,
      });
      const completedRecording = await context.finishRecording?.();
      if (completedRecording) {
         result.session.recording = completedRecording;
      }
      return result;
   } finally {
      await adapter.stop().catch(ignoreError);
   }
}
