/**
 * A problem the caller can fix. `problems` lists every issue found, so an agent can
 * correct a rejected submission in one attempt.
 */
export class AuditError extends Error {
   public readonly code: string;
   public readonly problems: readonly string[];

   public constructor(code: string, message: string, problems: readonly string[] = []) {
      super(message);
      this.name = 'AuditError';
      this.code = code;
      this.problems = problems;
   }
}
