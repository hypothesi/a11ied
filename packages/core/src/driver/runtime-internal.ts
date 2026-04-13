import {
   accessibilityDriverSessionSchema,
   driverActionResultSchema,
   type AccessibilityDriverSession,
   type DriverActionResult,
   type DriverCheckpoint,
   type Platform,
} from '@a11ied/contracts';
import { createDriverAdapter } from '@a11ied/guidepup';

import { executeAction } from './broker-actions.js';
import { removeSessionArtifacts, writeSessionMetadata } from './session-utils.js';
import type { ActiveSessionRecording } from './recording.js';
import {
   buildEphemeralResult,
   createEphemeralRecording,
   type EphemeralActionOptions,
} from './runtime-ephemeral.js';
import {
   createInMemoryRecording,
   createInMemorySessionRecord,
   type InMemorySessionStartOptions,
} from './runtime-memory.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

interface InMemoryBroker {
   session: AccessibilityDriverSession;
   target: Platform;
   checkpoints: DriverCheckpoint[];
   adapter: ReturnType<typeof createDriverAdapter>;
   recording: ActiveSessionRecording | undefined;
}

export const inMemoryBrokers = new Map<string, InMemoryBroker>();

const SESSION_NO_OP_ACTIONS = new Set(['read', 'logs']);

const SPEECH_TRIGGERING_ACTIONS = new Set([
   'next',
   'previous',
   'key',
   'type',
   'interact',
   'stop-interacting',
   'click-current-item',
]);

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
   options: InMemorySessionStartOptions,
): Promise<AccessibilityDriverSession> {
   const cwd = options.cwd ?? process.cwd();
   const adapter = createDriverAdapter(options.target);
   const checkpoints: DriverCheckpoint[] = [];
   const recording = createInMemoryRecording(options, cwd);
   await adapter.start();
   const state = await adapter.readState(checkpoints);
   const session = createInMemorySessionRecord({
      options,
      adapter,
      logCursor: state.logCursor,
      recording,
   });
   inMemoryBrokers.set(options.sessionId, {
      session,
      target: options.target,
      checkpoints,
      adapter,
      recording,
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
   let completedRecording = broker.session.recording;
   if (broker.recording) {
      completedRecording = await broker.recording.stop();
   }
   await broker.adapter.stop();
   inMemoryBrokers.delete(sessionId);
   const session = accessibilityDriverSessionSchema.parse({
      ...broker.session,
      recording: completedRecording ?? broker.session.recording,
   });
   await removeSessionArtifacts(session);
   return driverActionResultSchema.parse({
      session: {
         ...session,
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

function assertInMemoryActionHandled(
   action: DriverActionResult['action'],
   handled: boolean,
): void {
   if (!handled && !SESSION_NO_OP_ACTIONS.has(action)) {
      throw new CliEnvironmentError(
         'unsupported-action',
         `Driver action "${action}" is unsupported in this lifecycle.`,
         { action },
      );
   }
}

async function maybeStabilizeSpeech(
   adapter: InMemoryBroker['adapter'],
   action: DriverActionResult['action'],
   handled: boolean,
): Promise<void> {
   if (handled && SPEECH_TRIGGERING_ACTIONS.has(action)) {
      await adapter.waitForSpeechStabilization();
   }
}

function attachDuration(
   result: DriverActionResult,
   actionDurationMs: number,
): DriverActionResult {
   result.actionDurationMs = actionDurationMs;
   return result;
}

async function finalizeInMemoryAction(args: {
   broker: InMemoryBroker;
   action: DriverActionResult['action'];
   payload: Record<string, unknown> | undefined;
   startedAt: number;
}): Promise<DriverActionResult> {
   const result = await buildInMemoryResult(args.broker, args.action, args.payload);
   return attachDuration(result, Date.now() - args.startedAt);
}

export async function runInMemoryAction(
   sessionId: string,
   action: DriverActionResult['action'],
   payload?: Record<string, unknown>,
): Promise<DriverActionResult> {
   const broker = getInMemoryBroker(sessionId);
   const startTime = Date.now();
   const execution = await executeAction(
      { adapter: broker.adapter, checkpoints: broker.checkpoints },
      action,
      payload,
   );
   assertInMemoryActionHandled(action, execution.handled);
   await maybeStabilizeSpeech(broker.adapter, action, execution.handled);
   return finalizeInMemoryAction({
      broker,
      action,
      payload: execution.details ?? payload,
      startedAt: startTime,
   });
}

async function executeEphemeralAction(args: {
   adapter: ReturnType<typeof createDriverAdapter>;
   checkpoints: DriverCheckpoint[];
   recording: ActiveSessionRecording | undefined;
   options: EphemeralActionOptions;
}): Promise<DriverActionResult> {
   const startTime = Date.now();
   const execution = await executeAction(
      { adapter: args.adapter, checkpoints: args.checkpoints },
      args.options.action,
      args.options.payload,
   );
   await maybeStabilizeSpeech(args.adapter, args.options.action, execution.handled);
   const result = await buildEphemeralResult({
      adapter: args.adapter,
      checkpoints: args.checkpoints,
      target: args.options.target,
      action: args.options.action,
      payload: execution.details ?? args.options.payload,
      cwd: args.options.cwd,
      recording: args.recording,
   });
   return attachDuration(result, Date.now() - startTime);
}

export async function runEphemeralAction(
   options: EphemeralActionOptions,
): Promise<DriverActionResult> {
   const adapter = createDriverAdapter(options.target);
   const checkpoints: DriverCheckpoint[] = [];
   const recording = createEphemeralRecording(options);
   await adapter.start();
   try {
      return await executeEphemeralAction({
         adapter,
         checkpoints,
         recording,
         options,
      });
   } finally {
      await adapter.stop().catch((error: unknown) => error);
   }
}
