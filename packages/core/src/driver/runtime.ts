import type {
   AccessibilityDriverSession,
   DriverActionRequest,
   DriverActionResult,
   DriverMode,
   Platform,
} from '@a11ied/contracts';

import {
   connectToBroker,
   resolveBrokerReadyTimeoutMs,
   spawnBrokerProcess,
   waitForBroker,
} from './broker-client.js';
import { sendSessionRequest } from './broker-runtime.js';
import { resolveAvailableDefaultTarget } from './default-target.js';
import { resolveDriverMode } from './environment.js';
import { validateRecordingRequest } from './recording.js';
import { runEphemeralAction } from './runtime-ephemeral.js';
import { hasInProcessSession, startInProcessSession } from './runtime-internal.js';
import { assertTargetReady, parseBrokerActionResult } from './runtime-support.js';
import { withSessionStartLock } from './session-lock.js';
import {
   createMissingSessionError,
   createSessionId,
   ensureStateDirectory,
   getActiveSessionFile,
   getDriverSocketPath,
   isInMemorySession,
   isProcessRunning,
   readActiveSessionMetadata,
   removeSessionArtifacts,
} from './session-utils.js';

export { getActiveSessionFile, getDriverSocketPath } from './session-utils.js';

/** The broker stops a session nobody has talked to for this long. */
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
const MS_PER_MINUTE = 60_000;

export interface DriverRequestOptions {
   /** Bounds the screen reader command; the broker reply is allowed a few seconds more. */
   timeoutMs?: number | undefined;
}

export interface StartDriverSessionOptions {
   /** Defaults to the platform screen reader, falling back to virtual. */
   target?: Platform;
   /** Defaults to `$A11IED_DRIVER_MODE`, which is `broker` unless set to `in-process`. */
   mode?: DriverMode;
   recordingPath?: string | undefined;
   /** The page the session opened; recorded in the session metadata. */
   url?: string | undefined;
   /** The app the session opened; a bare focus action refocuses it. */
   app?: AccessibilityDriverSession['app'] | undefined;
   /** 0 disables the idle timeout. */
   idleTimeoutMinutes?: number | undefined;
   /** Bounds how long to wait for the broker to come up. */
   timeoutMs?: number | undefined;
}

export interface DriverSessionStart {
   session: AccessibilityDriverSession;
   /** The session that was live before this start and was stopped to make room. */
   replacedSession?: AccessibilityDriverSession;
}

async function isSessionLive(session: AccessibilityDriverSession): Promise<boolean> {
   if (isInMemorySession(session)) {
      return hasInProcessSession(session.sessionId);
   }
   if (!isProcessRunning(session.brokerPid)) {
      return false;
   }
   try {
      const response = await connectToBroker(session.socketPath, { command: 'ping' });
      return response.ok;
   } catch {
      return false;
   }
}

/** Reads the active session, dropping its files when the broker behind it is gone. */
export async function getActiveDriverSession(): Promise<
   AccessibilityDriverSession | undefined
> {
   const session = await readActiveSessionMetadata();
   if (!session) {
      return undefined;
   }
   if (await isSessionLive(session)) {
      return session;
   }
   await removeSessionArtifacts(session);
   return undefined;
}

/**
 * Removes the active session file when its broker no longer answers; returns the ids
 * removed.
 */
export async function cleanupStaleDriverSessions(): Promise<string[]> {
   const session = await readActiveSessionMetadata();
   if (!session || (await isSessionLive(session))) {
      return [];
   }
   await removeSessionArtifacts(session);
   return [session.sessionId];
}

async function requireActiveSession(): Promise<AccessibilityDriverSession> {
   const session = await getActiveDriverSession();
   if (!session) {
      throw createMissingSessionError();
   }
   return session;
}

async function resolveStartTarget(target: Platform | undefined): Promise<Platform> {
   if (target) {
      return target;
   }
   const fallback = await resolveAvailableDefaultTarget();
   return fallback.target;
}

async function launchSession(
   options: StartDriverSessionOptions,
   target: Platform,
): Promise<AccessibilityDriverSession> {
   const idleTimeoutMinutes = options.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES,
      sessionId = createSessionId();
   const shared = {
      sessionId,
      target,
      recordingPath: options.recordingPath,
      url: options.url,
      app: options.app,
      idleTimeoutMinutes,
   };
   if ((options.mode ?? resolveDriverMode()) === 'in-process') {
      return startInProcessSession(shared);
   }
   spawnBrokerProcess({
      ...shared,
      metadataFile: getActiveSessionFile(),
      socketPath: getDriverSocketPath(sessionId),
      idleTimeoutMs: idleTimeoutMinutes * MS_PER_MINUTE,
   });
   return waitForBroker({
      sessionId,
      readSession: readActiveSessionMetadata,
      timeoutMs: options.timeoutMs ?? resolveBrokerReadyTimeoutMs(target),
   });
}

/** Reads the active session's metadata and current reader state. */
export async function getDriverSessionStatus(
   options: DriverRequestOptions = {},
): Promise<DriverActionResult> {
   const session = await requireActiveSession();
   const response = await sendSessionRequest(session, { command: 'status', ...options });
   return parseBrokerActionResult({
      actionErrorMessage: 'Could not read the active driver session.',
      response,
   });
}

/** Stops the active session, finishing any recording, and removes its state files. */
export async function stopDriverSession(
   options: DriverRequestOptions = {},
): Promise<DriverActionResult> {
   const session = await requireActiveSession();
   const response = await sendSessionRequest(session, { command: 'stop', ...options });
   const result = parseBrokerActionResult({
      actionErrorMessage: 'Could not stop the active driver session.',
      response,
   });
   await removeSessionArtifacts(session);
   return result;
}

/**
 * Starts the one active driver session. A live previous session is stopped first and
 * returned as `replacedSession`; the start itself runs under an exclusive lock file.
 */
export async function startDriverSession(
   options: StartDriverSessionOptions = {},
): Promise<DriverSessionStart> {
   await ensureStateDirectory();
   const target = await resolveStartTarget(options.target);
   await assertTargetReady(target);
   if (options.recordingPath) {
      validateRecordingRequest(target, options.recordingPath);
   }
   return withSessionStartLock(async () => {
      const previous = await getActiveDriverSession();
      if (previous) {
         await stopDriverSession();
      }
      const session = await launchSession(options, target);
      return previous ? { session, replacedSession: previous } : { session };
   });
}

/**
 * Points the active session at a page. The virtual target loads the HTML; real targets
 * only record the URL, because they read whatever window is on screen.
 */
export async function attachDocumentToDriverSession(
   document: { html: string; url: string },
   options: DriverRequestOptions = {},
): Promise<DriverActionResult> {
   const session = await requireActiveSession();
   const response = await sendSessionRequest(session, {
      command: 'attach-document',
      payload: document,
      ...options,
   });
   return parseBrokerActionResult({
      actionErrorMessage: `Could not open ${document.url} in the active driver session.`,
      response,
   });
}

/** Runs one typed action against the active session. */
export async function runDriverSessionAction(
   request: DriverActionRequest,
   options: DriverRequestOptions = {},
): Promise<DriverActionResult> {
   const session = await requireActiveSession();
   const response = await sendSessionRequest(session, {
      command: 'action',
      action: request.action,
      payload: 'payload' in request ? request.payload : undefined,
      ...options,
   });
   return parseBrokerActionResult({
      actionErrorMessage: `Could not run driver action "${request.action}".`,
      response,
   });
}

export interface EphemeralDriverActionOptions extends DriverRequestOptions {
   target?: Platform;
   request: DriverActionRequest;
   recordingPath?: string | undefined;
}

/** Runs one action in a short-lived session that is torn down before returning. */
export async function runEphemeralDriverAction(
   options: EphemeralDriverActionOptions,
): Promise<DriverActionResult> {
   const target = await resolveStartTarget(options.target);
   await assertTargetReady(target);
   return runEphemeralAction({
      target,
      request: options.request,
      recordingPath: options.recordingPath,
      timeoutMs: options.timeoutMs,
   });
}
