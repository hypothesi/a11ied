import type {
   AccessibilityDriverSession,
   Platform,
   VirtualEngine,
} from '@a11ied/contracts';
import { ignoreError, isVoiceOverRunning, type DriverAdapter } from '@a11ied/guidepup';

import { handleBrokerRequest } from './broker-handlers.js';
import { cleanupAfterError, closeContext } from './context-queue.js';
import type {
   BrokerHandlerContext,
   BrokerRequest,
   BrokerResponse,
} from './broker-types.js';
import { createDriverSessionContext, stopSessionResources } from './session-context.js';
import {
   getActiveSessionFile,
   getInMemorySocketPath,
   removeSessionArtifacts,
   writeRecoveryMetadata,
} from './session-utils.js';
import { listFailureDetails } from './broker-errors.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

const VOICE_OVER_POLL_INTERVAL_MS = 1000;

interface InProcessSession {
   adapter: DriverAdapter;
   context: BrokerHandlerContext;
   monitorTimer?: NodeJS.Timeout | undefined;
}

/** Sessions that live inside this process, keyed by session id. */
const inProcessSessions = new Map<string, InProcessSession>();

/** Resolve an explicit owner, or the latest stopping owner without metadata. */
export function getRetainedInProcessSession(
   sessionId?: string,
): AccessibilityDriverSession | undefined {
   if (sessionId !== undefined) {
      return inProcessSessions.get(sessionId)?.context.session;
   }
   const entry = [...inProcessSessions.values()].findLast(
      (candidate) => candidate.context.stopping,
   );
   return entry?.context.session;
}

/** Preserve a failed owner and its stop route before surfacing the original errors. */
export async function retainInProcessRecovery(
   context: BrokerHandlerContext,
   error: unknown,
): Promise<never> {
   const previous = inProcessSessions.get(context.session.sessionId);
   if (previous?.monitorTimer) {
      clearInterval(previous.monitorTimer);
   }
   Object.assign(context, { stopping: true, writeMetadata: writeRecoveryMetadata });
   context.session.metadataFile = getActiveSessionFile();
   context.session.socketPath = getInMemorySocketPath(context.session.sessionId);
   inProcessSessions.set(context.session.sessionId, {
      adapter: context.adapter,
      context,
      monitorTimer: undefined,
   });
   const details = {
      sessionId: context.session.sessionId,
      mode: 'in-process',
      failures: listFailureDetails(error),
   };
   const recoveryError = new CliEnvironmentError(
      'session-cleanup-failed',
      `Cleanup is unconfirmed. Call stopDriverSession({sessionId: "${context.session.sessionId}"}) in this process.`,
      details,
   );
   recoveryError.cause = error;
   try {
      await writeRecoveryMetadata(context.session);
   } catch (metadataError) {
      recoveryError.cause = new AggregateError(
         [error, metadataError],
         'Cleanup and recovery publication failed.',
      );
      details.failures = listFailureDetails(recoveryError.cause);
   }
   throw recoveryError;
}

export interface InProcessStartOptions {
   target: Platform;
   sessionId: string;
   recordingPath?: string | undefined;
   url?: string | undefined;
   app?: AccessibilityDriverSession['app'] | undefined;
   browser?: string | undefined;
   nativeInput?: AccessibilityDriverSession['nativeInput'];
   idleTimeoutMinutes?: number | undefined;
   engine?: VirtualEngine | undefined;
}

/** Finalize a confirmed owner without reentering its command queue. */
export async function finalizeInProcessRecovery(
   context: BrokerHandlerContext,
): Promise<void> {
   const entry = inProcessSessions.get(context.session.sessionId);
   if (entry?.context !== context) {
      return;
   }
   if (!context.resourcesStopped) {
      throw new CliEnvironmentError(
         'session-cleanup-unconfirmed',
         'Resource shutdown is unconfirmed.',
      );
   }
   await removeSessionArtifacts(context.session);
   if (entry.monitorTimer) {
      clearInterval(entry.monitorTimer);
   }
   inProcessSessions.delete(context.session.sessionId);
}

async function teardownInProcessSession(sessionId: string): Promise<void> {
   const entry = inProcessSessions.get(sessionId);
   if (!entry) {
      return;
   }
   const finalize = async (): Promise<void> => {
      entry.context.resourcesStopped = true;
      await finalizeInProcessRecovery(entry.context);
   };
   await closeContext(entry.context, async () => {
      if (entry.context.resourcesStopped) {
         await finalize();
         return;
      }
      await stopSessionResources(entry.adapter, entry.context.finishRecording, finalize);
   });
}

function createVoiceOverInProcessMonitor(
   target: Platform,
   sessionId: string,
): NodeJS.Timeout | undefined {
   if (target !== 'voiceover') {
      return undefined;
   }
   const timer = setInterval(async () => {
      if (inProcessSessions.get(sessionId)?.context.stopping) {
         return;
      }
      const running = await isVoiceOverRunning().catch(() => false);
      if (!running) {
         await teardownInProcessSession(sessionId).catch(ignoreError);
      }
   }, VOICE_OVER_POLL_INTERVAL_MS);
   timer.unref();
   return timer;
}

/** Starts a session whose adapter and transcript live in the calling process. */
export async function startInProcessSession(
   options: InProcessStartOptions,
): Promise<AccessibilityDriverSession> {
   const { adapter, context } = await createDriverSessionContext({
      ...options,
      metadataFile: getActiveSessionFile(),
      socketPath: getInMemorySocketPath(options.sessionId),
      persist: true,
   });
   if (context.startupError) {
      return retainInProcessRecovery(context, context.startupError);
   }
   const monitorTimer = createVoiceOverInProcessMonitor(
      options.target,
      options.sessionId,
   );
   inProcessSessions.set(options.sessionId, { adapter, context, monitorTimer });
   try {
      await writeRecoveryMetadata(context.session);
   } catch (error) {
      try {
         return await cleanupAfterError(
            () => teardownInProcessSession(options.sessionId),
            error,
         );
      } catch (cleanupError) {
         if (inProcessSessions.has(options.sessionId)) {
            return retainInProcessRecovery(context, cleanupError);
         }
         throw cleanupError;
      }
   }
   return context.session;
}

export function hasInProcessSession(sessionId: string): boolean {
   return inProcessSessions.has(sessionId);
}

export function listInProcessSessionIds(): string[] {
   return [...inProcessSessions.keys()];
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
         error: {
            code: 'session-not-found',
            message: `Session "${sessionId}" is not running here.`,
         },
      };
   }
   const result = await handleBrokerRequest(entry.context, request);
   if (result.shouldStop) {
      await teardownInProcessSession(sessionId);
   }
   return result.response;
}
