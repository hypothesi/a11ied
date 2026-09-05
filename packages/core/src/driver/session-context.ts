import {
   accessibilityDriverSessionSchema,
   type AccessibilityDriverSession,
   type DriverCheckpoint,
   type Platform,
   type SessionRecording,
   type VirtualEngine,
} from '@a11ied/contracts';
import { createDriverAdapter, type DriverAdapter } from '@a11ied/guidepup';

import type { BrokerHandlerContext } from './broker-types.js';
import type { ActiveSessionRecording } from './recording.js';
import { writeSessionMetadata } from './session-utils.js';
import { TranscriptRecorder } from './transcript-recorder.js';
import { createVirtualHost } from './virtual-host-choice.js';

export interface SessionContextOptions {
   target: Platform;
   sessionId: string;
   metadataFile: string;
   socketPath: string;
   recording: ActiveSessionRecording | undefined;
   /** When false the session is never written to disk (ephemeral runs). */
   persist: boolean;
   url?: string | undefined;
   app?: AccessibilityDriverSession['app'] | undefined;
   idleTimeoutMinutes?: number | undefined;
   /** Where a virtual session runs; picked from the URL and the host when absent. */
   engine?: VirtualEngine | undefined;
}

/** The adapter for the target, and for virtual the engine its document ended up in. */
async function createSessionAdapter(
   options: SessionContextOptions,
): Promise<{ adapter: DriverAdapter; engine: VirtualEngine | undefined }> {
   if (options.target !== 'virtual') {
      return { adapter: createDriverAdapter(options.target), engine: undefined };
   }
   const virtualHost = await createVirtualHost({
      engine: options.engine,
      url: options.url,
   });
   return {
      adapter: createDriverAdapter('virtual', { virtualHost }),
      engine: virtualHost.engine,
   };
}

function buildSessionRecord(
   options: SessionContextOptions,
   adapter: DriverAdapter,
   state: { logCursor: number; engine: VirtualEngine | undefined },
): AccessibilityDriverSession {
   return accessibilityDriverSessionSchema.parse({
      sessionId: options.sessionId,
      target: options.target,
      targetType: options.target === 'virtual' ? 'simulated' : 'real',
      startedAt: new Date().toISOString(),
      capabilities: adapter.capabilities,
      logCursor: state.logCursor,
      brokerPid: process.pid,
      socketPath: options.socketPath,
      metadataFile: options.metadataFile,
      recording: options.recording?.metadata,
      url: options.url,
      app: options.app,
      idleTimeoutMinutes: options.idleTimeoutMinutes,
      engine: state.engine,
   });
}

async function noopWriteMetadata(): Promise<void> {
   // Ephemeral sessions never touch the state directory.
}

/**
 * Starts the adapter and builds the handler context shared by the broker process, the
 * in-process runtime, and ephemeral runs, so all three run the same request handlers.
 */
export async function createDriverSessionContext(
   options: SessionContextOptions,
): Promise<{ adapter: DriverAdapter; context: BrokerHandlerContext }> {
   const { adapter, engine } = await createSessionAdapter(options),
      checkpoints: DriverCheckpoint[] = [],
      transcript = new TranscriptRecorder();
   let recording = options.recording;
   await adapter.start();
   const initialState = await adapter.readState(checkpoints);
   transcript.capture(initialState);
   const context: BrokerHandlerContext = {
      adapter,
      session: buildSessionRecord(options, adapter, {
         logCursor: initialState.logCursor,
         engine,
      }),
      checkpoints,
      transcript,
      writeMetadata: options.persist ? writeSessionMetadata : noopWriteMetadata,
      async finishRecording(): Promise<SessionRecording | undefined> {
         if (!recording) {
            return context.session.recording;
         }
         const completedRecording = await recording.stop();
         recording = undefined;
         return completedRecording;
      },
   };
   return { adapter, context };
}
