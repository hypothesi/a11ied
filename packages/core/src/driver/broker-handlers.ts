import {
   DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
   driverActionResultSchema,
   type DriverActionName,
   type DriverActionResult,
   type DriverStateSnapshot,
} from '@a11ied/contracts';

import type {
   BrokerHandlerContext,
   BrokerRequest,
   BrokerResponse,
   HandleResult,
} from './broker-types.js';
import { parseActionRequest } from './broker-actions.js';
import {
   captureContextState,
   runContextAction,
   runContextWait,
   type ContextActionResult,
} from './context-action.js';
import { withContextCommand } from './context-queue.js';
import { toBrokerError } from './broker-errors.js';
import { initializeSessionTarget, stopSessionResources } from './session-context.js';

/** Persists the session with the log cursor the state reports and builds the result. */
async function finishActionResult(
   context: BrokerHandlerContext,
   result: { action: DriverActionName; state: DriverStateSnapshot },
   details?: Record<string, unknown>,
): Promise<DriverActionResult> {
   const updatedSession = { ...context.session, logCursor: result.state.logCursor };
   context.session = updatedSession;
   await context.writeMetadata(updatedSession);
   return driverActionResultSchema.parse({
      session: updatedSession,
      action: result.action,
      state: result.state,
      details,
   });
}

/** Captures the current state without running an action, for status and stop. */
async function buildActionResult(
   context: BrokerHandlerContext,
   action: DriverActionName,
   details?: Record<string, unknown>,
): Promise<DriverActionResult> {
   const state = await captureContextState(context, {
      tail: DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
      limit: DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
   });
   return finishActionResult(context, { action, state }, details);
}

async function handleStatusCommand(context: BrokerHandlerContext): Promise<HandleResult> {
   const result = await buildActionResult(context, 'status');
   return { response: { ok: true, result }, shouldStop: false };
}

async function getStopObservation(
   context: BrokerHandlerContext,
): Promise<Pick<BrokerResponse, 'result' | 'error'>> {
   try {
      return { result: await buildActionResult(context, 'stop') };
   } catch (error) {
      return { error: toBrokerError(error) };
   }
}

async function finishStopRecording(context: BrokerHandlerContext): Promise<void> {
   const recording = await context.finishRecording?.();
   if (recording) {
      context.session.recording = recording;
   }
}

function buildStopResult(
   context: BrokerHandlerContext,
   observation: Pick<BrokerResponse, 'error' | 'result'>,
   error = observation.error,
): HandleResult {
   if (observation.result) {
      observation.result.session = context.session;
   }
   if (error) {
      error.details = {
         ...error.details,
         cleanupConfirmed: context.resourcesStopped ?? false,
      };
   }
   return {
      response: { ...observation, ok: error === undefined, ...(error ? { error } : {}) },
      shouldStop: context.resourcesStopped ?? false,
   };
}

async function handleStopCommand(context: BrokerHandlerContext): Promise<HandleResult> {
   context.stopping = true;
   const observation = await getStopObservation(context);
   try {
      if (!context.resourcesStopped) {
         await stopSessionResources(
            context.adapter,
            () => finishStopRecording(context),
            async () => {
               context.resourcesStopped = true;
            },
         );
      }
      await context.writeMetadata(context.session);
      return buildStopResult(context, observation);
   } catch (error) {
      return buildStopResult(context, observation, toBrokerError(error));
   }
}

async function handleAttachDocumentCommand(
   context: BrokerHandlerContext,
   request: BrokerRequest,
): Promise<HandleResult> {
   const html = String(request.payload?.html ?? '');
   const url = String(request.payload?.url ?? '');
   const app =
      context.session.target === 'virtual'
         ? context.session.app
         : await initializeSessionTarget(
              {
                 target: context.session.target,
                 url,
                 app: context.session.app,
                 browser: context.session.browser,
              },
              context.adapter,
           );
   await context.adapter.attachDocument({ html, url });
   if (url) {
      context.session = {
         ...context.session,
         url,
         app,
         browser: context.session.browser ?? app?.appName,
      };
   }
   const result = await buildActionResult(context, 'attach-document', { url });
   return { response: { ok: true, result }, shouldStop: false };
}

async function finishHandledAction(
   context: BrokerHandlerContext,
   ran: ContextActionResult,
): Promise<HandleResult> {
   const result = await finishActionResult(context, ran, ran.details);
   result.actionDurationMs = ran.actionDurationMs;
   return { response: { ok: true, result }, shouldStop: false };
}

async function handleActionCommand(
   context: BrokerHandlerContext,
   request: BrokerRequest,
): Promise<HandleResult> {
   const actionRequest = parseActionRequest(request.action, request.payload);
   if (actionRequest.action === 'wait') {
      return runContextWait(context, actionRequest.payload, (ran) =>
         finishHandledAction(context, ran),
      );
   }
   const options =
      request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs };
   const ran = await runContextAction(context, actionRequest, options);
   return finishHandledAction(context, ran);
}

async function routeCommand(
   context: BrokerHandlerContext,
   request: BrokerRequest,
): Promise<HandleResult> {
   switch (request.command) {
      case 'ping': {
         return {
            response: {
               ok: true,
               stopping: context.stopping ?? false,
               session: context.session,
               ...(context.startupError
                  ? { error: toBrokerError(context.startupError) }
                  : {}),
            },
            shouldStop: false,
         };
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
      if (
         request.command === 'ping' ||
         (request.command === 'action' && request.action === 'wait')
      ) {
         return await routeCommand(context, request);
      }
      return await withContextCommand(
         context,
         () => routeCommand(context, request),
         request.command === 'stop',
      );
   } catch (error) {
      const shouldStop = request.command === 'attach-document';
      if (shouldStop) {
         context.stopping = true;
      }
      return { response: { ok: false, error: toBrokerError(error) }, shouldStop };
   }
}
