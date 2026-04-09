import { cliExitCodes } from '@a11ied/contracts';

/** Raised when a caller provides invalid CLI input or an unsupported option mix. */
export class CliUsageError extends Error {
   readonly exitCode = cliExitCodes.usage;
   readonly code: string;
   readonly details: Record<string, unknown> | undefined;

   constructor(code: string, message: string, details?: Record<string, unknown>) {
      super(message);
      this.name = 'CliUsageError';
      this.code = code;
      this.details = details;
   }
}

export { CliEnvironmentError } from './cli-environment-error.js';
