import {
   driverActionResultSchema,
   type DriverActionResult,
   type Platform,
} from '@a11ied/contracts';
import { createDriverAdapter } from '@a11ied/guidepup';

import { spawnBrokerProcess, type connectToBroker } from './broker-client.js';
import { inMemoryBrokers } from './runtime-internal.js';
import {
   getDriverSessionMetadataPath,
   getDriverSocketPath,
   useInMemoryBroker,
} from './session-utils.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

export function createMissingSessionError(
   sessionId: string,
   details?: Record<string, unknown>,
): CliEnvironmentError {
   return new CliEnvironmentError(
      'session-not-found',
      `Driver session "${sessionId}" was not found.`,
      details ?? { sessionId },
   );
}

export function parseBrokerActionResult(args: {
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

export function getActiveInMemoryIds(): Set<string> | undefined {
   if (useInMemoryBroker()) {
      return new Set(inMemoryBrokers.keys());
   }
   return undefined;
}

export async function assertTargetReady(target: Platform): Promise<void> {
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

export function buildSessionPaths(cwd: string): {
   sessionId: string;
   metadataFile: string;
   socketPath: string;
} {
   const sessionId = `drv_${crypto.randomUUID()}`;
   return {
      sessionId,
      metadataFile: getDriverSessionMetadataPath(sessionId, cwd),
      socketPath: getDriverSocketPath(sessionId, cwd),
   };
}

export function spawnPersistentBroker(args: {
   sessionId: string;
   target: Platform;
   metadataFile: string;
   socketPath: string;
   recordingPath?: string;
}): void {
   const spawnOptions = {
      sessionId: args.sessionId,
      target: args.target,
      metadataFile: args.metadataFile,
      socketPath: args.socketPath,
   };

   if (args.recordingPath) {
      spawnBrokerProcess({ ...spawnOptions, recordingPath: args.recordingPath });
      return;
   }

   spawnBrokerProcess(spawnOptions);
}
