import { cliMessageSchema, type CliMessage } from '@a11ied/contracts';

export function appendProcedureError(args: {
   criterionId: string;
   procedureId: string;
   cause: string;
   errors: CliMessage[];
}): void {
   args.errors.push(
      cliMessageSchema.parse({
         code: 'verification-procedure-error',
         message: `Procedure "${args.procedureId}" failed for criterion ${args.criterionId}.`,
         details: {
            criterionId: args.criterionId,
            procedureId: args.procedureId,
            cause: args.cause,
         },
      }),
   );
}
