import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';
import type { AccessibilityDriverSession } from '@a11ied/contracts';
import type { BrokerResponse } from './broker-types.js';
import { DriverCommandError } from '@a11ied/guidepup';

type BrokerError = NonNullable<BrokerResponse['error']>;

/** Old detached owners cannot inherit the new adapter guard without restarting. */
export function assertSessionInputPolicy(session: AccessibilityDriverSession): void {
   if (session.target !== 'virtual' && session.nativeInput === undefined) {
      throw new CliEnvironmentError(
         'native-input-policy-missing',
         'This session has no native input policy. Stop it and start a new session before sending input.',
         { sessionId: session.sessionId },
      );
   }
}

function getBrokerError(error: unknown): BrokerError {
   if (error instanceof CliUsageError || error instanceof CliEnvironmentError) {
      const brokerError: BrokerError = {
         code: error.code,
         message: error.message,
         exitCode: error.exitCode,
      };
      if (error.details) {
         brokerError.details = error.details;
      }
      return brokerError;
   }
   if (error instanceof Error && 'code' in error) {
      return {
         code: String(error.code),
         message: error.message,
         ...(error instanceof DriverCommandError ? { details: error.details } : {}),
      };
   }
   if (error instanceof Error) {
      return { code: 'broker-error', message: error.message };
   }
   return { code: 'broker-error', message: String(error) };
}

const MAX_FAILURE_CODE_LENGTH = 120,
   MAX_FAILURE_COUNT = 20,
   MAX_FAILURE_DEPTH = 8,
   MAX_FAILURE_MESSAGE_LENGTH = 2000,
   MAX_FAILURE_VISITS = 100;
interface FailureDetail {
   code: string;
   message: string;
}

function listFailureChildren(error: unknown): unknown[] {
   if (error instanceof AggregateError) {
      return error.errors.slice(0, MAX_FAILURE_VISITS);
   }
   return error instanceof Error && error.cause !== undefined ? [error.cause] : [];
}

function collectFailureDetails(
   error: unknown,
   walk: { failures: FailureDetail[]; visited: Set<Error>; remaining: number },
   depth: number,
): void {
   if (
      walk.remaining === 0 ||
      walk.failures.length >= MAX_FAILURE_COUNT ||
      (error instanceof Error && walk.visited.has(error))
   ) {
      return;
   }
   walk.remaining -= 1;
   if (error instanceof Error) {
      walk.visited.add(error);
   }
   const children = depth < MAX_FAILURE_DEPTH ? listFailureChildren(error) : [],
      count = walk.failures.length;
   for (const child of children) {
      collectFailureDetails(child, walk, depth + 1);
      if (walk.remaining === 0 || walk.failures.length >= MAX_FAILURE_COUNT) {
         break;
      }
   }
   if (walk.failures.length > count) {
      return;
   }
   const { code, message } = getBrokerError(error);
   walk.failures.push({
      code: code.slice(0, MAX_FAILURE_CODE_LENGTH),
      message: message.slice(0, MAX_FAILURE_MESSAGE_LENGTH),
   });
}

/** Keep original failure reasons available after cause chains cross transport. */
export function listFailureDetails(error: unknown): FailureDetail[] {
   const failures: FailureDetail[] = [];
   collectFailureDetails(
      error,
      { failures, visited: new Set(), remaining: MAX_FAILURE_VISITS },
      0,
   );
   return failures;
}

/** Preserve typed errors and individual cleanup failures across broker transports. */
export function toBrokerError(error: unknown): BrokerError {
   const result = getBrokerError(error);
   if (
      error instanceof AggregateError ||
      (error instanceof Error && error.cause !== undefined)
   ) {
      result.details = { ...result.details, failures: listFailureDetails(error) };
   }
   return result;
}
