import { WcagEngineNotFoundError, WcagEngineValidationError } from '@a11ied/wcag-engine';

import { CliUsageError } from './cli-errors.js';

/**
 * Turns an engine error into the CLI error the command layer knows how to print.
 *
 * Both lookup families raise the same two engine errors, so the translation lives here
 * rather than being repeated per family.
 */
export function normalizeEngineError(error: unknown): never {
   if (
      error instanceof WcagEngineValidationError &&
      error.payload.type === 'validation-error'
   ) {
      throw new CliUsageError('validation-error', error.payload.message, {
         field: error.payload.field,
         value: error.payload.value,
         supportedVersions: error.payload.supportedVersions,
         supportedLevels: error.payload.supportedLevels,
      });
   }

   if (error instanceof WcagEngineNotFoundError && error.payload.type === 'not-found') {
      throw new CliUsageError('criterion-not-found', error.payload.message, {
         lookupKey: error.payload.lookupKey,
      });
   }

   throw error;
}
