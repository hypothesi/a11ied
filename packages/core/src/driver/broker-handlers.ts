import { driverActionResultSchema, type DriverActionResult } from '@a11ied/contracts';

import type {
   ActionExecutionResult,
   BrokerHandlerContext,
   BrokerRequest,
   BrokerResponse,
   HandleResult,
} from './broker-types.js';
import {
   executeAction,
   isUnknownAction,
   maybeStabilizeSpeech,
} from './broker-actions.js';

function toBrokerError(error: unknown): BrokerResponse['error'] {
   if (error instanceof Error && 'code' in error) {
      return {
         code: String(error.code),
         message: error.message,
      };
   }

   if (error instanceof Error) {
      return {
         code: 'broker-error',
         message: error.message,
      };
   }

   return {
      code: 'broker-error',
      message: String(error),
   };
}

function attachActionDuration(
   result: DriverActionResult,
   actionDurationMs: number,
): DriverActionResult {
   result.actionDurationMs = actionDurationMs;
   return result;
}

async function buildActionResult(
   context: BrokerHandlerContext,
   action: DriverActionResult['action'],
   details?: Record<string, unknown>,
): Promise<DriverActionResult> {
   const state = await context.adapter.readState(context.checkpoints);
   const updatedSession = {
      ...context.session,
      logCursor: state.logCursor,
   };
   context.session = updatedSession;
   await context.writeMetadata(updatedSession);
   return driverActionResultSchema.parse({
      session: updatedSession,
      action,
      state,
      details,
   });
}

async function buildActionHandleResult(args: {
   context: BrokerHandlerContext;
   action: DriverActionResult['action'];
   payload: Record<string, unknown> | undefined;
   execution: ActionExecutionResult;
   startedAt: number;
}): Promise<HandleResult> {
   const result = await buildActionResult(
      args.context,
      args.action,
      args.execution.details ?? args.payload,
   );
   attachActionDuration(result, Date.now() - args.startedAt);
   return { response: { ok: true, result }, shouldStop: false };
}

async function handleStatusCommand(context: BrokerHandlerContext): Promise<HandleResult> {
   const result = await buildActionResult(context, 'status');
   return { response: { ok: true, result }, shouldStop: false };
}

async function finishStopRecording(
   context: BrokerHandlerContext,
): Promise<BrokerResponse['error'] | undefined> {
   if (!context.finishRecording) {
      return undefined;
   }

   try {
      const completedRecording = await context.finishRecording();
      if (completedRecording) {
         context.session = {
            ...context.session,
            recording: completedRecording,
         };
      }
      return undefined;
   } catch (error) {
      return toBrokerError(error);
   }
}

function buildStopHandleResult(
   result: DriverActionResult,
   recordingError: BrokerResponse['error'] | undefined,
): HandleResult {
   if (!recordingError) {
      return { response: { ok: true, result }, shouldStop: true };
   }

   return {
      response: {
         ok: false,
         error: recordingError,
         result,
      },
      shouldStop: true,
   };
}

async function handleStopCommand(context: BrokerHandlerContext): Promise<HandleResult> {
   const recordingError = await finishStopRecording(context);
   const result = await buildActionResult(context, 'stop');
   return buildStopHandleResult(result, recordingError);
}

async function handleAttachDocumentCommand(
   context: BrokerHandlerContext,
   request: BrokerRequest,
): Promise<HandleResult> {
   const html = String(request.payload?.html ?? '');
   const url = String(request.payload?.url ?? '');
   await context.adapter.attachDocument({ html, url });
   const state = await context.adapter.readState(context.checkpoints);
   await context.writeMetadata({
      ...context.session,
      logCursor: state.logCursor,
   });
   return { response: { ok: true }, shouldStop: false };
}

async function handleActionCommand(
   context: BrokerHandlerContext,
   request: BrokerRequest,
): Promise<HandleResult> {
   const action = request.action ?? 'read';
   const startTime = Date.now();
   const execution = await executeAction(context, action, request.payload);
   if (isUnknownAction(action, execution.handled)) {
      return {
         response: {
            ok: false,
            error: {
               code: 'unknown-action',
               message: `Unknown driver action "${String(action)}".`,
            },
         },
         shouldStop: false,
      };
   }
   await maybeStabilizeSpeech(context.adapter, action, execution.handled);
   return buildActionHandleResult({
      context,
      action,
      payload: request.payload,
      execution,
      startedAt: startTime,
   });
}

function buildUnknownCommandResponse(command: string): HandleResult {
   return {
      response: {
         ok: false,
         error: {
            code: 'unknown-command',
            message: `Unknown broker command "${command}".`,
         },
      },
      shouldStop: false,
   };
}

async function routeCommand(
   context: BrokerHandlerContext,
   request: BrokerRequest,
): Promise<HandleResult> {
   if (request.command === 'status') {
      return handleStatusCommand(context);
   }
   if (request.command === 'stop') {
      return handleStopCommand(context);
   }
   if (request.command === 'attach-document') {
      return handleAttachDocumentCommand(context, request);
   }
   if (request.command === 'action') {
      return handleActionCommand(context, request);
   }
   return buildUnknownCommandResponse(String(request.command));
}

export async function handleBrokerRequest(
   context: BrokerHandlerContext,
   request: BrokerRequest,
): Promise<HandleResult> {
   if (request.command === 'ping') {
      return { response: { ok: true }, shouldStop: false };
   }
   return await routeCommand(context, request);
}
