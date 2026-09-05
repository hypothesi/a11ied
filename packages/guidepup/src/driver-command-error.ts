/**
 * Raised when a command name cannot be resolved, or a target cannot run the command it
 * resolved to. The CLI reports it as a usage error with exit code 2.
 */
export class DriverCommandError extends Error {
   readonly code: string;
   readonly details: Record<string, unknown>;
   constructor(code: string, message: string, details: Record<string, unknown>) {
      super(message);
      this.name = 'DriverCommandError';
      this.code = code;
      this.details = details;
   }
}
