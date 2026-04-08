import {
   accessibilityDriverSessionSchema,
   driverActionResultSchema,
   type AccessibilityDriverSession,
   type DriverActionResult,
   type DriverCheckpoint,
   type Platform,
} from '@a11lied/contracts';
import { createDriverAdapter } from '@a11lied/guidepup';

import { executeAction } from './broker-handlers.js';
import {
   buildEphemeralSession,
   removeSessionArtifacts,
   writeSessionMetadata,
} from './session-utils.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

export interface InMemoryBroker {
   session: AccessibilityDriverSession;
   target: Platform;
   checkpoints: DriverCheckpoint[];
   adapter: ReturnType<typeof createDriverAdapter>;
}

export const inMemoryBrokers = new Map<string, InMemoryBroker>();

const SESSION_NO_OP_ACTIONS = new Set(['read', 'logs']);

export function getInMemoryBroker(sessionId: string): InMemoryBroker {
   const broker = inMemoryBrokers.get(sessionId);
   if (!broker) {
      throw new CliEnvironmentError(
         'session-not-found',
         `Driver session "${sessionId}" was not found.`,
         { sessionId },
      );
   }
   return broker;
}

export async function startInMemorySession(
   target: Platform,
   sessionId: string,
   metadataFile: string,
): Promise<AccessibilityDriverSession> {
   const adapter = createDriverAdapter(target);
   const checkpoints: DriverCheckpoint[] = [];
   await adapter.start();
   const state = await adapter.readState(checkpoints);
   const session = accessibilityDriverSessionSchema.parse({
      sessionId,
      target,
      startedAt: new Date().toISOString(),
      capabilities: adapter.capabilities,
      logCursor: state.logCursor,
      brokerPid: process.pid,
      socketPath: `in-memory://${sessionId}`,
      metadataFile,
   });
   inMemoryBrokers.set(sessionId, {
      session,
      target,
      checkpoints,
      adapter,
   });
   await writeSessionMetadata(session);
   return session;
}

export async function getInMemoryStatus(
   broker: InMemoryBroker,
): Promise<DriverActionResult> {
   const state = await broker.adapter.readState(broker.checkpoints);
   return driverActionResultSchema.parse({
      session: {
         ...broker.session,
         logCursor: state.logCursor,
      },
      action: 'status',
      state,
   });
}

export async function stopInMemorySession(
   sessionId: string,
): Promise<DriverActionResult> {
   const broker = getInMemoryBroker(sessionId);
   const state = await broker.adapter.readState(broker.checkpoints);
   await broker.adapter.stop();
   inMemoryBrokers.delete(sessionId);
   await removeSessionArtifacts(broker.session);
   return driverActionResultSchema.parse({
      session: {
         ...broker.session,
         logCursor: state.logCursor,
      },
      action: 'stop',
      state,
   });
}

export async function attachToInMemorySession(
   sessionId: string,
   document: { html: string; url: string },
): Promise<void> {
   const broker = getInMemoryBroker(sessionId);
   await broker.adapter.attachDocument(document);
   const state = await broker.adapter.readState(broker.checkpoints);
   const updatedSession = {
      ...broker.session,
      logCursor: state.logCursor,
   };
   broker.session = updatedSession;
   await writeSessionMetadata(updatedSession);
}

async function buildInMemoryResult(
   broker: InMemoryBroker,
   action: DriverActionResult['action'],
   payload?: Record<string, unknown>,
): Promise<DriverActionResult> {
   const state = await broker.adapter.readState(broker.checkpoints);
   const updatedSession = {
      ...broker.session,
      logCursor: state.logCursor,
   };
   broker.session = updatedSession;
   await writeSessionMetadata(updatedSession);
   return driverActionResultSchema.parse({
      session: updatedSession,
      action,
      state,
      details: payload,
   });
}

export async function runInMemoryAction(
   sessionId: string,
   action: DriverActionResult['action'],
   payload?: Record<string, unknown>,
): Promise<DriverActionResult> {
   const broker = getInMemoryBroker(sessionId);
   const handled = await executeAction(
      { adapter: broker.adapter, checkpoints: broker.checkpoints },
      action,
      payload,
   );
   if (!handled && !SESSION_NO_OP_ACTIONS.has(action)) {
      throw new CliEnvironmentError(
         'unsupported-action',
         `Driver action "${action}" is unsupported in this lifecycle.`,
         { action },
      );
   }
   return buildInMemoryResult(broker, action, payload);
}

interface EphemeralResultOptions {
   adapter: ReturnType<typeof createDriverAdapter>;
   checkpoints: DriverCheckpoint[];
   target: Platform;
   action: DriverActionResult['action'];
   payload: Record<string, unknown> | undefined;
   cwd: string;
}

async function buildEphemeralResult(
   options: EphemeralResultOptions,
): Promise<DriverActionResult> {
   let state = await options.adapter.readState(options.checkpoints);
   if (options.action === 'clear-logs') {
      state = await options.adapter.clearLogs(options.checkpoints);
   }
   return driverActionResultSchema.parse({
      session: buildEphemeralSession(options.target, options.cwd, state.logCursor),
      action: options.action,
      state,
      details: options.payload,
   });
}

interface EphemeralActionOptions {
   target: Platform;
   action: DriverActionResult['action'];
   payload: Record<string, unknown> | undefined;
   cwd: string;
}

export async function runEphemeralAction(
   options: EphemeralActionOptions,
): Promise<DriverActionResult> {
   const adapter = createDriverAdapter(options.target);
   const checkpoints: DriverCheckpoint[] = [];
   await adapter.start();
   try {
      await executeAction({ adapter, checkpoints }, options.action, options.payload);
      return buildEphemeralResult({
         adapter,
         checkpoints,
         target: options.target,
         action: options.action,
         payload: options.payload,
         cwd: options.cwd,
      });
   } finally {
      await adapter.stop().catch(() => {
         // No-op
      });
   }
}
