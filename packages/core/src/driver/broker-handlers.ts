import {
   driverActionResultSchema,
   type AccessibilityDriverSession,
   type DriverActionResult,
   type DriverCheckpoint,
} from '@a11lied/contracts';
import type { createDriverAdapter } from '@a11lied/guidepup';

export interface BrokerRequest {
   command: 'ping' | 'status' | 'stop' | 'action' | 'attach-document';
   action?: DriverActionResult['action'];
   payload?: Record<string, unknown>;
}

export interface BrokerResponse {
   ok: boolean;
   result?: DriverActionResult;
   error?: {
      code: string;
      message: string;
   };
}

export interface ActionContext {
   adapter: ReturnType<typeof createDriverAdapter>;
   checkpoints: DriverCheckpoint[];
}

export interface BrokerHandlerContext extends ActionContext {
   session: AccessibilityDriverSession;
   writeMetadata: (session: AccessibilityDriverSession) => Promise<void>;
}

export interface HandleResult {
   response: BrokerResponse;
   shouldStop: boolean;
}

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

async function executePayloadAction(
   context: ActionContext,
   action: DriverActionResult['action'] | undefined,
   payload?: Record<string, unknown>,
): Promise<boolean> {
   switch (action) {
      case 'key': {
         await context.adapter.press(String(payload?.keys ?? ''));
         return true;
      }
      case 'type': {
         await context.adapter.type(String(payload?.text ?? ''));
         return true;
      }
      case 'clear-logs': {
         await context.adapter.clearLogs(context.checkpoints);
         return true;
      }
      case 'checkpoint': {
         addCheckpoint(context.checkpoints, payload);
         return true;
      }
      default: {
         return false;
      }
   }
}

export async function executeAction(
   context: ActionContext,
   action: DriverActionResult['action'] | undefined,
   payload?: Record<string, unknown>,
): Promise<boolean> {
   const simpleHandler = getSimpleActionHandler(context.adapter, action);
   if (simpleHandler) {
      await simpleHandler();
      return true;
   }
   return await executePayloadAction(context, action, payload);
}

const BROKER_NO_OP_ACTIONS = new Set(['read', 'logs', 'attach-document']);

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

async function handleStopCommand(context: BrokerHandlerContext): Promise<HandleResult> {
   const result = await buildActionResult(context, 'stop');
   return { response: { ok: true, result }, shouldStop: true };
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
   const handled = await executeAction(context, action, request.payload);
   if (!handled && !BROKER_NO_OP_ACTIONS.has(String(action))) {
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
   const result = await buildActionResult(context, action, request.payload);
   return { response: { ok: true, result }, shouldStop: false };
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
