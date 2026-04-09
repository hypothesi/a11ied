import {
   notFoundErrorSchema,
   type CriterionLookupKey,
   type EngineQueryError,
} from '@a11ied/contracts';

/** Raised when a criterion or artifact lookup cannot be resolved. */
export class WcagEngineNotFoundError extends Error {
   readonly payload: EngineQueryError;

   constructor(lookupKey: CriterionLookupKey) {
      const payload = notFoundErrorSchema.parse({
         type: 'not-found',
         message: `Criterion lookup failed for "${lookupKey}".`,
         lookupKey,
      });
      super(payload.message);
      this.name = 'WcagEngineNotFoundError';
      this.payload = payload;
   }
}
