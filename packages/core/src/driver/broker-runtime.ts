import type { DriverActionResult } from '@a11ied/contracts';

import { connectToBroker, resolveBrokerSocketTimeoutMs } from './broker-client.js';
import { readSessionMetadata, removeSessionArtifacts } from './session-utils.js';
import { createMissingSessionError, parseBrokerActionResult } from './runtime-support.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

export interface BrokerSessionActionOptions {
   payload?: Record<string, unknown>;
   cwd?: string;
}

export async function getBrokerSessionStatus(
   sessionId: string,
   cwd: string,
): Promise<DriverActionResult> {
   const session = await readSessionMetadata(sessionId, cwd);
   try {
      const response = await connectToBroker(
         session.socketPath,
         { command: 'status' },
         resolveBrokerSocketTimeoutMs({ command: 'status' }, session.target),
      );
      return parseBrokerActionResult({
         sessionId,
         actionErrorMessage: `Could not read driver session "${sessionId}".`,
         response,
      });
   } catch {
      throw createMissingSessionError(sessionId);
   }
}

async function requestBrokerStop(
   sessionId: string,
   socketPath: string,
   session: Awaited<ReturnType<typeof readSessionMetadata>>,
): Promise<Awaited<ReturnType<typeof connectToBroker>>> {
   try {
      return await connectToBroker(
         socketPath,
         {
            command: 'stop',
         },
         resolveBrokerSocketTimeoutMs({ command: 'stop' }, session.target),
      );
   } catch {
      await removeSessionArtifacts(session);
      throw createMissingSessionError(sessionId);
   }
}

export async function stopBrokerSession(
   sessionId: string,
   cwd: string,
): Promise<DriverActionResult> {
   const session = await readSessionMetadata(sessionId, cwd);
   const response = await requestBrokerStop(sessionId, session.socketPath, session);
   const result = parseBrokerActionResult({
      sessionId,
      actionErrorMessage: `Could not stop driver session "${sessionId}".`,
      response,
   });
   await removeSessionArtifacts(session);
   return result;
}

export async function attachDocumentViaBroker(
   sessionId: string,
   document: { html: string; url: string },
   cwd: string,
): Promise<void> {
   const session = await readSessionMetadata(sessionId, cwd);
   try {
      const response = await connectToBroker(
         session.socketPath,
         {
            command: 'attach-document',
            payload: document,
         },
         resolveBrokerSocketTimeoutMs({ command: 'attach-document' }, session.target),
      );
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

export async function runBrokerAction(
   sessionId: string,
   action: DriverActionResult['action'],
   options?: BrokerSessionActionOptions,
): Promise<DriverActionResult> {
   const cwd = options?.cwd ?? process.cwd();
   const session = await readSessionMetadata(sessionId, cwd);
   try {
      const request = buildBrokerActionRequest(action, options?.payload);
      const response = await connectToBroker(
         session.socketPath,
         request,
         resolveBrokerSocketTimeoutMs({ command: 'action' }, session.target),
      );
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
