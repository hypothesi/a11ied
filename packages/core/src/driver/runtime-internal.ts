import type { AccessibilityDriverSession, Platform } from '@a11ied/contracts';
import type { DriverAdapter } from '@a11ied/guidepup';

import { handleBrokerRequest } from './broker-handlers.js';
import type { BrokerHandlerContext, BrokerRequest, BrokerResponse } from './broker-types.js';
import { startSessionRecording } from './recording.js';
import { createDriverSessionContext } from './session-context.js';
import {
   getActiveSessionFile,
   getInMemorySocketPath,
   removeSessionArtifacts,
   writeSessionMetadata,
} from './session-utils.js';

interface InProcessSession {
   adapter: DriverAdapter;
   context: BrokerHandlerContext;
}

/** Sessions that live inside this process, keyed by session id. */
const inProcessSessions = new Map<string, InProcessSession>();

export interface InProcessStartOptions {
   target: Platform;
   sessionId: string;
   recordingPath?: string | undefined;
   url?: string | undefined;
   app?: AccessibilityDriverSession['app'] | undefined;
   idleTimeoutMinutes?: number | undefined;
}

/** Starts a session whose adapter and transcript live in the calling process. */
export async function startInProcessSession(
   options: InProcessStartOptions,
): Promise<AccessibilityDriverSession> {
   const recording = options.recordingPath
      ? startSessionRecording(options.target, options.recordingPath)
      : undefined;
   const { adapter, context } = await createDriverSessionContext({
      ...options,
      metadataFile: getActiveSessionFile(),
      socketPath: getInMemorySocketPath(options.sessionId),
      recording,
      persist: true,
   });
   inProcessSessions.set(options.sessionId, { adapter, context });
   await writeSessionMetadata(context.session);
   return context.session;
}

export function hasInProcessSession(sessionId: string): boolean {
   return inProcessSessions.has(sessionId);
}

export function listInProcessSessionIds(): string[] {
   return [...inProcessSessions.keys()];
}

async function teardownInProcessSession(sessionId: string): Promise<void> {
   const entry = inProcessSessions.get(sessionId);
   if (!entry) {
      return;
   }
   inProcessSessions.delete(sessionId);
   await entry.adapter.stop().catch(() => undefined);
   await removeSessionArtifacts(entry.context.session);
}

/** Routes one request through the same handlers the broker process uses. */
export async function requestInProcess(
   sessionId: string,
   request: BrokerRequest,
): Promise<BrokerResponse> {
   const entry = inProcessSessions.get(sessionId);
   if (!entry) {
      return {
         ok: false,
         error: { code: 'session-not-found', message: `Session "${sessionId}" is not running here.` },
      };
   }
   const result = await handleBrokerRequest(entry.context, request);
   if (result.shouldStop) {
      await teardownInProcessSession(sessionId);
   }
   return result.response;
}
