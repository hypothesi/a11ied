import { notFoundErrorSchema, type EngineQueryError } from '@a11ied/contracts';

export type LookupKind =
   | 'criterion'
   | 'technique'
   | 'axe rule'
   | 'understanding document';

/** Raised when a criterion, technique, or axe rule lookup cannot be resolved. */
export class WcagEngineNotFoundError extends Error {
   readonly payload: EngineQueryError;

   constructor(lookupKey: string, kind: LookupKind = 'criterion') {
      const payload = notFoundErrorSchema.parse({
         type: 'not-found',
         message: `${kind[0]?.toUpperCase()}${kind.slice(1)} lookup failed for "${lookupKey}".`,
         lookupKey,
      });
      super(payload.message);
      this.name = 'WcagEngineNotFoundError';
      this.payload = payload;
   }
}
