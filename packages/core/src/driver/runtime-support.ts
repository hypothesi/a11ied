import {
   cliExitCodes,
   driverActionResultSchema,
   type DriverActionResult,
   type Platform,
} from '@a11ied/contracts';
import { createDriverAdapter } from '@a11ied/guidepup';

import type { BrokerResponse } from './broker-types.js';
import { createMissingSessionError } from './session-utils.js';
import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';

const MISSING_SOCKET_CODES = new Set(['ENOENT', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE']);

function rebuildBrokerError(error: NonNullable<BrokerResponse['error']>): Error {
   if (error.exitCode === cliExitCodes.usage) {
      return new CliUsageError(error.code, error.message, error.details);
   }
   return new CliEnvironmentError(error.code, error.message, error.details);
}

/** Turns a broker response into a parsed action result or the error it carried. */
export function parseBrokerActionResult(args: {
   actionErrorMessage: string;
   response: BrokerResponse;
}): DriverActionResult {
   if (!args.response.ok || !args.response.result) {
      if (args.response.error) {
         throw rebuildBrokerError(args.response.error);
      }
      throw new CliEnvironmentError('driver-broker-error', args.actionErrorMessage);
   }
   return driverActionResultSchema.parse(args.response.result);
}

function getErrorCode(error: unknown): string | undefined {
   if (typeof error === 'object' && error !== null && 'code' in error) {
      return String(error.code);
   }
   return undefined;
}

/** Maps socket failures onto the driver error codes the CLI already documents. */
export function normalizeBrokerTransportError(args: {
   error: unknown;
   action?: string | undefined;
}): Error {
   if (args.error instanceof CliEnvironmentError || args.error instanceof CliUsageError) {
      return args.error;
   }
   const code = getErrorCode(args.error);
   if (code !== undefined && MISSING_SOCKET_CODES.has(code)) {
      return createMissingSessionError();
   }
   const message = args.error instanceof Error ? args.error.message : String(args.error);
   if (message.includes('Broker connection timed out')) {
      const during = args.action ? ` during "${args.action}"` : '';
      return new CliEnvironmentError(
         'driver-broker-timeout',
         `Timed out waiting for the driver broker response${during}.`,
         { action: args.action },
      );
   }
   return new CliEnvironmentError('driver-broker-error', message, {
      action: args.action,
   });
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
