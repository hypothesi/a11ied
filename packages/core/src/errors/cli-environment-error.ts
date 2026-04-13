import { cliExitCodes } from '@a11ied/contracts';

/** Raised when the host environment prevents a command from completing. */
export class CliEnvironmentError extends Error {
   // Fallow-ignore-next-line unused-class-member
   readonly exitCode = cliExitCodes.environment;
   readonly code: string;
   readonly details: Record<string, unknown> | undefined;

   constructor(code: string, message: string, details?: Record<string, unknown>) {
      super(message);
      this.name = 'CliEnvironmentError';
      this.code = code;
      this.details = details;
   }
}
