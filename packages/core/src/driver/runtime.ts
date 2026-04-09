import type {
   AccessibilityDriverSession,
   DriverActionResult,
   Platform,
} from '@a11ied/contracts';

import { resolveBrokerReadyTimeoutMs, waitForBroker } from './broker-client.js';
import {
   attachDocumentViaBroker,
   getBrokerSessionStatus,
   runBrokerAction,
   stopBrokerSession,
} from './broker-runtime.js';
import {
   attachToInMemorySession,
   getInMemoryStatus,
   getInMemoryBroker,
   runEphemeralAction,
   runInMemoryAction,
   startInMemorySession,
   stopInMemorySession,
} from './runtime-internal.js';
import { validateRecordingRequest } from './recording.js';
import {
   ensureStateDirectories,
   getDriverSessionMetadataPath,
   getDriverSocketPath,
   getSessionsDir,
   listSessionEntries,
   processSessionEntry,
   readSessionMetadata,
   useInMemoryBroker,
} from './session-utils.js';
import {
   assertTargetReady,
   buildSessionPaths,
   getActiveInMemoryIds,
   spawnPersistentBroker,
} from './runtime-support.js';

export { getDriverSessionMetadataPath, getDriverSocketPath } from './session-utils.js';

export interface SessionActionOptions {
   payload?: Record<string, unknown>;
   cwd?: string;
}

function getPayloadRecordingPath(
   payload: Record<string, unknown> | undefined,
): string | undefined {
   if (typeof payload?.recordingPath === 'string') {
      return payload.recordingPath;
   }

   return undefined;
}

/** Removes stale persisted driver sessions whose backing broker is no longer alive. */
export async function cleanupStaleDriverSessions(cwd = process.cwd()): Promise<string[]> {
   const entries = await listSessionEntries(cwd);
   if (!entries) {
      return [];
   }
   const activeIds = getActiveInMemoryIds();
   const sessionsDir = getSessionsDir(cwd);
   const results = await Promise.all(
      entries.map((entry) => processSessionEntry(entry, sessionsDir, activeIds)),
   );
   return results.filter((id): id is string => id !== undefined);
}

function createInMemorySessionStartOptions(args: {
   target: Platform;
   sessionId: string;
   metadataFile: string;
   cwd: string;
   recordingPath: string | undefined;
}): Parameters<typeof startInMemorySession>[0] {
   const options = {
      target: args.target,
      sessionId: args.sessionId,
      metadataFile: args.metadataFile,
      cwd: args.cwd,
   } as Parameters<typeof startInMemorySession>[0];

   if (args.recordingPath) {
      options.recordingPath = args.recordingPath;
   }

   return options;
}

function createPersistentBrokerOptions(args: {
   target: Platform;
   sessionId: string;
   metadataFile: string;
   socketPath: string;
   recordingPath: string | undefined;
}): Parameters<typeof spawnPersistentBroker>[0] {
   const options = {
      sessionId: args.sessionId,
      target: args.target,
      metadataFile: args.metadataFile,
      socketPath: args.socketPath,
   } as Parameters<typeof spawnPersistentBroker>[0];

   if (args.recordingPath) {
      options.recordingPath = args.recordingPath;
   }

   return options;
}

/** Starts a persistent driver session for one target and returns its session metadata. */
export async function startDriverSession(
   target: Platform,
   cwd = process.cwd(),
   recordingPath?: string,
): Promise<AccessibilityDriverSession> {
   await ensureStateDirectories(cwd);
   await cleanupStaleDriverSessions(cwd);
   await assertTargetReady(target);
   if (recordingPath) {
      validateRecordingRequest(target, recordingPath, cwd);
   }

   const paths = buildSessionPaths(cwd);

   if (useInMemoryBroker()) {
      return startInMemorySession(
         createInMemorySessionStartOptions({
            target,
            sessionId: paths.sessionId,
            metadataFile: paths.metadataFile,
            cwd,
            recordingPath,
         }),
      );
   }

   spawnPersistentBroker(
      createPersistentBrokerOptions({
         target,
         sessionId: paths.sessionId,
         metadataFile: paths.metadataFile,
         socketPath: paths.socketPath,
         recordingPath,
      }),
   );
   return waitForBroker({
      sessionId: paths.sessionId,
      cwd,
      readSession: readSessionMetadata,
      timeoutMs: resolveBrokerReadyTimeoutMs(target),
   });
}

/** Reads the latest state for one persistent driver session. */
export async function getDriverSessionStatus(
   sessionId: string,
   cwd = process.cwd(),
): Promise<DriverActionResult> {
   if (useInMemoryBroker()) {
      return getInMemoryStatus(getInMemoryBroker(sessionId));
   }
   return getBrokerSessionStatus(sessionId, cwd);
}

/** Stops a persistent driver session and removes its persisted state. */
export async function stopDriverSession(
   sessionId: string,
   cwd = process.cwd(),
): Promise<DriverActionResult> {
   if (useInMemoryBroker()) {
      return stopInMemorySession(sessionId);
   }
   return stopBrokerSession(sessionId, cwd);
}

/** Attaches resolved HTML content to a driver session when the target supports it. */
export async function attachDocumentToDriverSession(
   sessionId: string,
   document: { html: string; url: string },
   cwd = process.cwd(),
): Promise<void> {
   if (useInMemoryBroker()) {
      await attachToInMemorySession(sessionId, document);
      return;
   }
   await attachDocumentViaBroker(sessionId, document, cwd);
}

/** Runs one action against an existing persistent driver session. */
export async function runDriverSessionAction(
   sessionId: string,
   action: DriverActionResult['action'],
   options?: SessionActionOptions,
): Promise<DriverActionResult> {
   if (useInMemoryBroker()) {
      return runInMemoryAction(sessionId, action, options?.payload);
   }
   return runBrokerAction(sessionId, action, options);
}

/** Runs one action against a short-lived, non-persistent driver session. */
export async function runEphemeralDriverAction(
   target: Platform,
   action: DriverActionResult['action'],
   options?: SessionActionOptions,
): Promise<DriverActionResult> {
   await assertTargetReady(target);
   const cwd = options?.cwd ?? process.cwd();
   const actionOptions = {
      target,
      action,
      payload: options?.payload,
      cwd,
   };
   const recordingPath = getPayloadRecordingPath(options?.payload);
   if (recordingPath) {
      return await runEphemeralAction({
         ...actionOptions,
         recordingPath,
      });
   }
   return await runEphemeralAction(actionOptions);
}
