import type {
   DriverActionRequestInput,
   DriverActionResult,
   Platform,
} from '@a11ied/contracts';

import type { BrokerHandlerContext } from './broker-types.js';
import { handleBrokerRequest } from './broker-handlers.js';
import { cleanupAfterError, closeContext } from './context-queue.js';
import { parseBrokerActionResult } from './runtime-support.js';
import { createDriverSessionContext, stopSessionResources } from './session-context.js';
import { createSessionId } from './session-utils.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';
import { listFailureDetails } from './broker-errors.js';
import { startDriverSession, stopDriverSession } from './runtime.js';
import { sendSessionRequest } from './broker-runtime.js';
import { retainInProcessRecovery } from './runtime-internal.js';

export interface EphemeralActionOptions {
   target: Platform;
   request: DriverActionRequestInput;
   recordingPath?: string | undefined;
   timeoutMs?: number | undefined;
}

async function finishBrokerEphemeralAction(
   options: { sessionId: string; timeoutMs?: number | undefined },
   action: PromiseSettledResult<DriverActionResult>,
): Promise<DriverActionResult> {
   try {
      return await stopDriverSession(options);
   } catch (cleanupError) {
      const failure: unknown =
         action.status === 'rejected'
            ? new AggregateError(
                 [action.reason, cleanupError],
                 'Action and cleanup failed.',
              )
            : cleanupError;
      const confirmed =
         cleanupError instanceof CliEnvironmentError &&
         cleanupError.details?.cleanupConfirmed === true;
      if (confirmed && action.status !== 'rejected') {
         throw failure;
      }
      const error = confirmed
         ? new CliEnvironmentError(
              'action-and-cleanup-failed',
              'The action failed and cleanup reported an error.',
              { cleanupConfirmed: true, failures: listFailureDetails(failure) },
           )
         : new CliEnvironmentError(
              'session-cleanup-failed',
              `Cleanup is unconfirmed. Retry "a1 sr stop --session-id ${options.sessionId}".`,
              { sessionId: options.sessionId, failures: listFailureDetails(failure) },
           );
      error.cause = failure;
      throw error;
   }
}

async function runBrokerEphemeralAction(
   options: EphemeralActionOptions,
): Promise<DriverActionResult> {
   const started = await startDriverSession({
      target: options.target,
      mode: 'broker',
      replaceActive: false,
      recordingPath: options.recordingPath,
   });
   const stopOptions = {
      sessionId: started.session.sessionId,
      timeoutMs: options.timeoutMs,
   };
   const [action] = await Promise.allSettled([
      (async (): Promise<DriverActionResult> => {
         const response = await sendSessionRequest(started.session, {
            command: 'action',
            action: options.request.action,
            payload: 'payload' in options.request ? options.request.payload : undefined,
            timeoutMs: options.timeoutMs,
         });
         return parseBrokerActionResult({
            response,
            actionErrorMessage: `Could not run driver action "${options.request.action}".`,
         });
      })(),
   ]);
   const stopped = await finishBrokerEphemeralAction(stopOptions, action);
   if (action.status === 'rejected') {
      throw action.reason;
   }
   action.value.session = stopped.session;
   return action.value;
}

async function stopEphemeralContext(context: BrokerHandlerContext): Promise<void> {
   await closeContext(context, () =>
      stopSessionResources(context.adapter, context.finishRecording, async () => {
         context.resourcesStopped = true;
      }),
   );
}

async function cleanupEphemeralError(
   context: BrokerHandlerContext,
   error: unknown,
): Promise<never> {
   try {
      return await cleanupAfterError(() => stopEphemeralContext(context), error);
   } catch (cleanupError) {
      if (!context.resourcesStopped) {
         return retainInProcessRecovery(context, cleanupError);
      }
      throw cleanupError;
   }
}

/** Native actions use a broker so cleanup retries survive the calling process. */
export async function runEphemeralAction(
   options: EphemeralActionOptions,
): Promise<DriverActionResult> {
   if (options.target !== 'virtual') {
      return runBrokerEphemeralAction(options);
   }
   const sessionId = `ephemeral_${createSessionId()}`;
   const { context } = await createDriverSessionContext({
      target: options.target,
      sessionId,
      metadataFile: `ephemeral://${sessionId}`,
      socketPath: `ephemeral://${sessionId}`,
      recordingPath: options.recordingPath,
      persist: false,
   });
   if (context.startupError) {
      return retainInProcessRecovery(context, context.startupError);
   }
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
      await stopEphemeralContext(context);
      return result;
   } catch (error) {
      return cleanupEphemeralError(context, error);
   }
}
