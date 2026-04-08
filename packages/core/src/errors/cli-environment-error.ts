import { cliExitCodes } from '@a11lied/contracts';

export class CliEnvironmentError extends Error {
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
