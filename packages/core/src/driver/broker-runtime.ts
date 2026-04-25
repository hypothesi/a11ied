import type { DriverActionResult } from '@a11ied/contracts';

import { connectToBroker, resolveBrokerSocketTimeoutMs } from './broker-client.js';
import { readSessionMetadata, removeSessionArtifacts } from './session-utils.js';
import { createMissingSessionError, parseBrokerActionResult } from './runtime-support.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

interface BrokerSessionActionOptions {
   payload?: Record<string, unknown>;
   cwd?: string;
}

function normalizeBrokerTransportError(args: {
   error: unknown;
   sessionId: string;
   action?: string;
}): CliEnvironmentError {
   if (args.error instanceof CliEnvironmentError) {
      return args.error;
   }

   if (
      typeof args.error === 'object' &&
      args.error !== null &&
      'code' in args.error &&
      (args.error as { code?: string }).code &&
      ['ENOENT', 'ECONNREFUSED', 'ECONNRESET'].includes(
         String((args.error as { code?: string }).code),
      )
   ) {
      return createMissingSessionError(args.sessionId);
   }

   const message = args.error instanceof Error ? args.error.message : String(args.error);

   if (message.includes('Broker connection timed out')) {
      return new CliEnvironmentError(
         'driver-broker-timeout',
         `Timed out waiting for the driver broker response${args.action ? ` during "${args.action}"` : ''}.`,
         {
            sessionId: args.sessionId,
            action: args.action,
         },
      );
   }

   return new CliEnvironmentError('driver-broker-error', message, {
      sessionId: args.sessionId,
      action: args.action,
   });
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
   } catch (error) {
      throw normalizeBrokerTransportError({ error, sessionId });
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
   } catch (error) {
      throw normalizeBrokerTransportError({
         error,
         sessionId,
         action: 'attach-document',
      });
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
   } catch (error) {
      throw normalizeBrokerTransportError({ error, sessionId, action });
   }
}
