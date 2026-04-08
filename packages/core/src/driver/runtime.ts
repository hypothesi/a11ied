import { randomUUID } from 'node:crypto';

import {
   driverActionResultSchema,
   type AccessibilityDriverSession,
   type DriverActionResult,
   type Platform,
} from '@a11lied/contracts';
import { createDriverAdapter } from '@a11lied/guidepup';

import { connectToBroker, spawnBrokerProcess, waitForBroker } from './broker-client.js';
import {
   attachToInMemorySession,
   getInMemoryStatus,
   getInMemoryBroker,
   inMemoryBrokers,
   runEphemeralAction,
   runInMemoryAction,
   startInMemorySession,
   stopInMemorySession,
} from './runtime-internal.js';
import {
   ensureStateDirectories,
   getDriverSessionMetadataPath,
   getDriverSocketPath,
   getSessionsDir,
   listSessionEntries,
   processSessionEntry,
   readSessionMetadata,
   removeSessionArtifacts,
   useInMemoryBroker,
} from './session-utils.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

export { getDriverSessionMetadataPath, getDriverSocketPath } from './session-utils.js';

export interface SessionActionOptions {
   payload?: Record<string, unknown>;
   cwd?: string;
}

function createMissingSessionError(
   sessionId: string,
   details?: Record<string, unknown>,
): CliEnvironmentError {
   return new CliEnvironmentError(
      'session-not-found',
      `Driver session "${sessionId}" was not found.`,
      details ?? { sessionId },
   );
}

function parseBrokerActionResult(args: {
   sessionId: string;
   actionErrorMessage: string;
   response: Awaited<ReturnType<typeof connectToBroker>>;
   details?: Record<string, unknown>;
}): DriverActionResult {
   if (!args.response.ok || !args.response.result) {
      throw new CliEnvironmentError(
         args.response.error?.code ?? 'driver-broker-error',
         args.response.error?.message ?? args.actionErrorMessage,
         args.details ?? { sessionId: args.sessionId },
      );
   }
   return driverActionResultSchema.parse(args.response.result);
}

function getActiveInMemoryIds(): Set<string> | undefined {
   if (useInMemoryBroker()) {
      return new Set(inMemoryBrokers.keys());
   }
   return undefined;
}

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

async function assertTargetReady(target: Platform): Promise<void> {
   const readiness = await createDriverAdapter(target).checkReadiness();
   if (readiness.status !== 'ready') {
      throw new CliEnvironmentError('target-not-ready', readiness.summary, {
         target,
         status: readiness.status,
         details: readiness.details,
         setupCommand: readiness.setupCommand,
      });
   }
}

export async function startDriverSession(
   target: Platform,
   cwd = process.cwd(),
): Promise<AccessibilityDriverSession> {
   await ensureStateDirectories(cwd);
   await cleanupStaleDriverSessions(cwd);
   await assertTargetReady(target);

   const sessionId = `drv_${randomUUID()}`;
   const metadataFile = getDriverSessionMetadataPath(sessionId, cwd);

   if (useInMemoryBroker()) {
      return startInMemorySession(target, sessionId, metadataFile);
   }

   const socketPath = getDriverSocketPath(sessionId, cwd);
   spawnBrokerProcess({ sessionId, target, metadataFile, socketPath });
   return await waitForBroker(sessionId, cwd, readSessionMetadata);
}

async function getBrokerSessionStatus(
   sessionId: string,
   cwd: string,
): Promise<DriverActionResult> {
   const session = await readSessionMetadata(sessionId, cwd);
   try {
      const response = await connectToBroker(session.socketPath, {
         command: 'status',
      });
      return parseBrokerActionResult({
         sessionId,
         actionErrorMessage: `Could not read driver session "${sessionId}".`,
         response,
      });
   } catch {
      throw createMissingSessionError(sessionId);
   }
}

export async function getDriverSessionStatus(
   sessionId: string,
   cwd = process.cwd(),
): Promise<DriverActionResult> {
   if (useInMemoryBroker()) {
      return getInMemoryStatus(getInMemoryBroker(sessionId));
   }
   return getBrokerSessionStatus(sessionId, cwd);
}

async function stopBrokerSession(
   sessionId: string,
   cwd: string,
): Promise<DriverActionResult> {
   const session = await readSessionMetadata(sessionId, cwd);
   try {
      const response = await connectToBroker(session.socketPath, {
         command: 'stop',
      });
      const result = parseBrokerActionResult({
         sessionId,
         actionErrorMessage: `Could not stop driver session "${sessionId}".`,
         response,
      });
      await removeSessionArtifacts(session);
      return result;
   } catch {
      await removeSessionArtifacts(session);
      throw createMissingSessionError(sessionId);
   }
}

export async function stopDriverSession(
   sessionId: string,
   cwd = process.cwd(),
): Promise<DriverActionResult> {
   if (useInMemoryBroker()) {
      return stopInMemorySession(sessionId);
   }
   return stopBrokerSession(sessionId, cwd);
}

async function attachDocumentViaBroker(
   sessionId: string,
   document: { html: string; url: string },
   cwd: string,
): Promise<void> {
   const session = await readSessionMetadata(sessionId, cwd);
   try {
      const response = await connectToBroker(session.socketPath, {
         command: 'attach-document',
         payload: document,
      });
      if (!response.ok) {
         throw new CliEnvironmentError(
            response.error?.code ?? 'driver-broker-error',
            response.error?.message ??
               `Could not attach document to driver session "${sessionId}".`,
            { sessionId },
         );
      }
   } catch {
      throw createMissingSessionError(sessionId);
   }
}

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

function buildBrokerActionRequest(
   action: DriverActionResult['action'],
   payload?: Record<string, unknown>,
): {
   command: 'action';
   action: DriverActionResult['action'];
   payload?: Record<string, unknown>;
} {
   if (payload) {
      return { command: 'action', action, payload };
   }
   return { command: 'action', action };
}

async function runBrokerAction(
   sessionId: string,
   action: DriverActionResult['action'],
   options?: SessionActionOptions,
): Promise<DriverActionResult> {
   const cwd = options?.cwd ?? process.cwd();
   const session = await readSessionMetadata(sessionId, cwd);
   try {
      const request = buildBrokerActionRequest(action, options?.payload);
      const response = await connectToBroker(session.socketPath, request);
      return parseBrokerActionResult({
         sessionId,
         actionErrorMessage: `Could not run driver action "${action}" for session "${sessionId}".`,
         response,
         details: { sessionId, action },
      });
   } catch {
      throw createMissingSessionError(sessionId);
   }
}

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

export async function runEphemeralDriverAction(
   target: Platform,
   action: DriverActionResult['action'],
   options?: SessionActionOptions,
): Promise<DriverActionResult> {
   await assertTargetReady(target);
   const cwd = options?.cwd ?? process.cwd();
   return await runEphemeralAction({
      target,
      action,
      payload: options?.payload,
      cwd,
   });
}
