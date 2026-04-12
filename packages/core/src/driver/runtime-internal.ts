import {
   accessibilityDriverSessionSchema,
   driverActionResultSchema,
   type AccessibilityDriverSession,
   type DriverActionResult,
   type DriverCheckpoint,
   type Platform,
} from '@a11ied/contracts';
import { createDriverAdapter } from '@a11ied/guidepup';

import { executeAction } from './broker-handlers.js';
import {
   buildEphemeralSession,
   removeSessionArtifacts,
   writeSessionMetadata,
} from './session-utils.js';
import { startSessionRecording, type ActiveSessionRecording } from './recording.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

export interface InMemoryBroker {
   session: AccessibilityDriverSession;
   target: Platform;
   checkpoints: DriverCheckpoint[];
   adapter: ReturnType<typeof createDriverAdapter>;
   recording: ActiveSessionRecording | undefined;
}

export const inMemoryBrokers = new Map<string, InMemoryBroker>();

const SESSION_NO_OP_ACTIONS = new Set(['read', 'logs']);

const SPEECH_TRIGGERING_ACTIONS = new Set([
   'next', 'previous', 'key', 'type', 'interact',
   'stop-interacting', 'click-current-item',
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

interface InMemorySessionStartOptions {
   target: Platform;
   sessionId: string;
   metadataFile: string;
   recordingPath?: string;
   cwd?: string;
}

function createInMemoryRecording(
   options: InMemorySessionStartOptions,
   cwd: string,
): ActiveSessionRecording | undefined {
   if (options.recordingPath) {
      return startSessionRecording(options.target, options.recordingPath, cwd);
   }
   return undefined;
}

function createInMemorySessionRecord(args: {
   options: InMemorySessionStartOptions;
   adapter: ReturnType<typeof createDriverAdapter>;
   logCursor: number;
   recording: ActiveSessionRecording | undefined;
}): AccessibilityDriverSession {
   return accessibilityDriverSessionSchema.parse({
      sessionId: args.options.sessionId,
      target: args.options.target,
      targetType: args.options.target === 'virtual' ? 'simulated' : 'real',
      startedAt: new Date().toISOString(),
      capabilities: args.adapter.capabilities,
      logCursor: args.logCursor,
      brokerPid: process.pid,
      socketPath: `in-memory://${args.options.sessionId}`,
      metadataFile: args.options.metadataFile,
      recording: args.recording?.metadata,
   });
}

function createEphemeralRecording(
   options: EphemeralActionOptions,
): ActiveSessionRecording | undefined {
   if (options.recordingPath) {
      return startSessionRecording(options.target, options.recordingPath, options.cwd);
   }
   return undefined;
}

function createEphemeralSessionRecord(args: {
   target: Platform;
   cwd: string;
   logCursor: number;
   recording?: AccessibilityDriverSession['recording'];
}): AccessibilityDriverSession {
   if (args.recording) {
      return buildEphemeralSession({
         target: args.target,
         cwd: args.cwd,
         logCursor: args.logCursor,
         recording: args.recording,
      });
   }
   return buildEphemeralSession({
      target: args.target,
      cwd: args.cwd,
      logCursor: args.logCursor,
   });
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

export async function runInMemoryAction(
   sessionId: string,
   action: DriverActionResult['action'],
   payload?: Record<string, unknown>,
): Promise<DriverActionResult> {
   const broker = getInMemoryBroker(sessionId);
   const startTime = Date.now();
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
   if (handled && SPEECH_TRIGGERING_ACTIONS.has(action)) {
      await broker.adapter.waitForSpeechStabilization();
   }
   const actionDurationMs = Date.now() - startTime;
   const result = await buildInMemoryResult(broker, action, payload);
   result.actionDurationMs = actionDurationMs;
   return result;
}

interface EphemeralResultOptions {
   adapter: ReturnType<typeof createDriverAdapter>;
   checkpoints: DriverCheckpoint[];
   target: Platform;
   action: DriverActionResult['action'];
   payload: Record<string, unknown> | undefined;
   cwd: string;
   recording: ActiveSessionRecording | undefined;
}

async function buildEphemeralResult(
   options: EphemeralResultOptions,
): Promise<DriverActionResult> {
   let state = await options.adapter.readState(options.checkpoints);
   if (options.action === 'clear-logs') {
      state = await options.adapter.clearLogs(options.checkpoints);
   }
   let completedRecording = undefined;
   if (options.recording) {
      completedRecording = await options.recording.stop();
   }
   return driverActionResultSchema.parse({
      session: createEphemeralSessionRecord({
         target: options.target,
         cwd: options.cwd,
         logCursor: state.logCursor,
         recording: completedRecording,
      }),
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
   recordingPath?: string;
}

export async function runEphemeralAction(
   options: EphemeralActionOptions,
): Promise<DriverActionResult> {
   const adapter = createDriverAdapter(options.target);
   const checkpoints: DriverCheckpoint[] = [];
   const recording = createEphemeralRecording(options);
   await adapter.start();
   try {
      const startTime = Date.now();
      await executeAction({ adapter, checkpoints }, options.action, options.payload);
      if (SPEECH_TRIGGERING_ACTIONS.has(options.action)) {
         await adapter.waitForSpeechStabilization();
      }
      const actionDurationMs = Date.now() - startTime;
      const result = await buildEphemeralResult({
         adapter,
         checkpoints,
         target: options.target,
         action: options.action,
         payload: options.payload,
         cwd: options.cwd,
         recording,
      });
      result.actionDurationMs = actionDurationMs;
      return result;
   } finally {
      await adapter.stop().catch((error: unknown) => error);
   }
}
