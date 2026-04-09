import {
   validationErrorSchema,
   type EngineQueryError,
   type WcagLevel,
   type WcagVersion,
} from '@a11ied/contracts';

function buildValidationMessage(field: string, value: string): string {
   if (field === 'version') {
      return `WCAG version "${value}" is unsupported.`;
   }
   if (field === 'level') {
      return `WCAG level "${value}" is unsupported.`;
   }
   return `Invalid value "${value}" for field "${field}".`;
}

/** Raised when a WCAG engine query uses unsupported or malformed input. */
export class WcagEngineValidationError extends Error {
   readonly payload: EngineQueryError;

   constructor(
      field: string,
      value: string,
      options?: {
         supportedVersions?: WcagVersion[];
         supportedLevels?: WcagLevel[];
      },
   ) {
      const payload = validationErrorSchema.parse({
         type: 'validation-error',
         message: buildValidationMessage(field, value),
         field,
         value,
         supportedVersions: options?.supportedVersions,
         supportedLevels: options?.supportedLevels,
      });
      super(payload.message);
      this.name = 'WcagEngineValidationError';
      this.payload = payload;
   }
}
