import {
   driverActionResultSchema,
   type DriverActionName,
   type DriverActionResult,
} from '@a11ied/contracts';

import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';
import type {
   ActionExecutionResult,
   BrokerHandlerContext,
   BrokerRequest,
   BrokerResponse,
   HandleResult,
} from './broker-types.js';
import {
   executeAction,
   parseActionRequest,
   SPEECH_TRIGGERING_ACTIONS,
} from './broker-actions.js';

type BrokerError = NonNullable<BrokerResponse['error']>;

function toBrokerError(error: unknown): BrokerError {
   if (error instanceof CliUsageError || error instanceof CliEnvironmentError) {
      const brokerError: BrokerError = {
         code: error.code,
         message: error.message,
         exitCode: error.exitCode,
      };
      if (error.details) {
         brokerError.details = error.details;
      }
      return brokerError;
   }
   if (error instanceof Error && 'code' in error) {
      return { code: String(error.code), message: error.message };
   }
   if (error instanceof Error) {
      return { code: 'broker-error', message: error.message };
   }
   return { code: 'broker-error', message: String(error) };
}

/**
 * Reads the adapter state, stamps new phrases into the transcript, and persists the
 * session.
 */
async function buildActionResult(
   context: BrokerHandlerContext,
   action: DriverActionName,
   details?: Record<string, unknown>,
): Promise<DriverActionResult> {
   const rawState = await context.adapter.readState(context.checkpoints);
   context.transcript.capture(rawState);
   const state = context.transcript.attach(rawState);
   const updatedSession = { ...context.session, logCursor: state.logCursor };
   context.session = updatedSession;
   await context.writeMetadata(updatedSession);
   return driverActionResultSchema.parse({
      session: updatedSession,
      action,
      state,
      details,
   });
}

async function handleStatusCommand(context: BrokerHandlerContext): Promise<HandleResult> {
   const result = await buildActionResult(context, 'status');
   return { response: { ok: true, result }, shouldStop: false };
}

async function finishStopRecording(
   context: BrokerHandlerContext,
): Promise<BrokerError | undefined> {
   if (!context.finishRecording) {
      return undefined;
   }
   try {
      const completedRecording = await context.finishRecording();
      if (completedRecording) {
         context.session = { ...context.session, recording: completedRecording };
      }
      return undefined;
   } catch (error) {
      return toBrokerError(error);
   }
}

async function handleStopCommand(context: BrokerHandlerContext): Promise<HandleResult> {
   const recordingError = await finishStopRecording(context);
   const result = await buildActionResult(context, 'stop');
   if (!recordingError) {
      return { response: { ok: true, result }, shouldStop: true };
   }
   return { response: { ok: false, error: recordingError, result }, shouldStop: true };
}

async function handleAttachDocumentCommand(
   context: BrokerHandlerContext,
   request: BrokerRequest,
): Promise<HandleResult> {
   const html = String(request.payload?.html ?? '');
   const url = String(request.payload?.url ?? '');
   await context.adapter.attachDocument({ html, url });
   if (url) {
      context.session = { ...context.session, url };
   }
   const result = await buildActionResult(context, 'attach-document', { url });
   return { response: { ok: true, result }, shouldStop: false };
}

async function stabilizeSpeech(
   context: BrokerHandlerContext,
   action: DriverActionName,
): Promise<void> {
   if (SPEECH_TRIGGERING_ACTIONS.has(action)) {
      await context.adapter.waitForSpeechStabilization();
   }
}

async function handleActionCommand(
   context: BrokerHandlerContext,
   request: BrokerRequest,
): Promise<HandleResult> {
   const actionRequest = parseActionRequest(request.action, request.payload);
   const startTime = Date.now();
   const options =
      request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs };
   const execution: ActionExecutionResult = await executeAction(
      context,
      actionRequest,
      options,
   );
   await stabilizeSpeech(context, actionRequest.action);
   const result = await buildActionResult(
      context,
      actionRequest.action,
      execution.details,
   );
   result.actionDurationMs = Date.now() - startTime;
   return { response: { ok: true, result }, shouldStop: false };
}

async function routeCommand(
   context: BrokerHandlerContext,
   request: BrokerRequest,
): Promise<HandleResult> {
   switch (request.command) {
      case 'ping': {
         return { response: { ok: true }, shouldStop: false };
      }
      case 'status': {
         return handleStatusCommand(context);
      }
      case 'stop': {
         return handleStopCommand(context);
      }
      case 'attach-document': {
         return handleAttachDocumentCommand(context, request);
      }
      case 'action': {
         return handleActionCommand(context, request);
      }
      default: {
         return {
            response: {
               ok: false,
               error: {
                  code: 'unknown-command',
                  message: `Unknown broker command "${String(request.command)}".`,
               },
            },
            shouldStop: false,
         };
      }
   }
}

/**
 * Handles one broker request. Errors become `ok: false` responses that keep their codes,
 * so the client can rebuild the same CLI error on its side.
 */
export async function handleBrokerRequest(
   context: BrokerHandlerContext,
   request: BrokerRequest,
): Promise<HandleResult> {
   try {
      return await routeCommand(context, request);
   } catch (error) {
      return { response: { ok: false, error: toBrokerError(error) }, shouldStop: false };
   }
}
