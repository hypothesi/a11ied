import {
   accessibilityDriverSessionSchema,
   type AccessibilityDriverSession,
   type DriverCheckpoint,
   type Platform,
   type SessionRecording,
} from '@a11ied/contracts';
import { createDriverAdapter, type DriverAdapter } from '@a11ied/guidepup';

import type { BrokerHandlerContext } from './broker-types.js';
import type { ActiveSessionRecording } from './recording.js';
import { writeSessionMetadata } from './session-utils.js';
import { TranscriptRecorder } from './transcript.js';

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
}

function buildSessionRecord(
   options: SessionContextOptions,
   adapter: DriverAdapter,
   logCursor: number,
): AccessibilityDriverSession {
   return accessibilityDriverSessionSchema.parse({
      sessionId: options.sessionId,
      target: options.target,
      targetType: options.target === 'virtual' ? 'simulated' : 'real',
      startedAt: new Date().toISOString(),
      capabilities: adapter.capabilities,
      logCursor,
      brokerPid: process.pid,
      socketPath: options.socketPath,
      metadataFile: options.metadataFile,
      recording: options.recording?.metadata,
      url: options.url,
      app: options.app,
      idleTimeoutMinutes: options.idleTimeoutMinutes,
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
   const adapter = createDriverAdapter(options.target),
      checkpoints: DriverCheckpoint[] = [],
      transcript = new TranscriptRecorder();
   let recording = options.recording;
   await adapter.start();
   const initialState = await adapter.readState(checkpoints);
   transcript.capture(initialState);
   const context: BrokerHandlerContext = {
      adapter,
      session: buildSessionRecord(options, adapter, initialState.logCursor),
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
