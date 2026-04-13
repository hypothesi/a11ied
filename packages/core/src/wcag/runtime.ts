import {
   wcagLevelSchema,
   type CriterionLookupKey,
   type WcagLevel,
   type WcagVersion,
} from '@a11ied/contracts';
import {
   WcagEngineNotFoundError,
   WcagEngineValidationError,
   getCoverage,
   getCriterion,
   getCriterionApplicability,
   listApplicableCriteria,
   listCriteriaByLevel,
   searchCriteria,
} from '@a11ied/wcag-engine';

import { deriveApplicabilityInputFromHtml } from '../applicability/html.js';
import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';
import {
   resolveDocumentTarget,
   type ResolveDocumentTargetInput,
} from '../targets/runtime.js';
import { parseWcagLevel, parseWcagVersion } from './parsing.js';

export { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';

function normalizeEngineError(error: unknown): never {
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

/** Lists the supported WCAG conformance levels for one pinned WCAG version. */
export function listWcagLevels(version: string): {
   version: WcagVersion;
   levels: WcagLevel[];
} {
   return {
      version: parseWcagVersion(version),
      levels: [...wcagLevelSchema.options],
   };
}

type WcagCriteriaListing = Omit<ReturnType<typeof listCriteriaByLevel>, 'level'> & {
   level: WcagLevel | 'all';
};

/** Lists criteria for one conformance level, or all levels when omitted. */
export function listWcagCriteria(
   level: string | undefined,
   version: string,
): WcagCriteriaListing {
   const parsedVersion = parseWcagVersion(version);

   try {
      if (level === undefined) {
         const criteria = wcagLevelSchema.options.flatMap(
            (entry) => listCriteriaByLevel(entry, parsedVersion).criteria,
         );
         return {
            version: parsedVersion,
            level: 'all',
            criteria,
         };
      }

      const parsedLevel = parseWcagLevel(level);
      return listCriteriaByLevel(parsedLevel, parsedVersion);
   } catch (error) {
      normalizeEngineError(error);
   }
}

/** Resolves one criterion by id or slug for the requested WCAG version. */
export function showWcagCriterion(
   lookupKey: CriterionLookupKey,
   version: string,
): ReturnType<typeof getCriterion> {
   const parsedVersion = parseWcagVersion(version);

   try {
      return getCriterion(lookupKey, { version: parsedVersion });
   } catch (error) {
      normalizeEngineError(error);
   }
}

/** Searches the local criterion corpus with ranked match metadata. */
export function searchWcagCriteria(
   query: string,
   options: { version: string; limit: number },
): ReturnType<typeof searchCriteria> {
   const parsedVersion = parseWcagVersion(options.version);
   if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new CliUsageError(
         'validation-error',
         `Search limit "${options.limit}" is invalid.`,
         {
            field: 'limit',
            value: options.limit,
         },
      );
   }

   try {
      return searchCriteria(query, {
         version: parsedVersion,
         limit: options.limit,
      });
   } catch (error) {
      normalizeEngineError(error);
   }
}

/** Returns coverage and verification-strategy metadata for one criterion. */
export function showWcagCoverage(
   lookupKey: CriterionLookupKey,
   version: string,
): ReturnType<typeof getCoverage> {
   const parsedVersion = parseWcagVersion(version);

   try {
      return getCoverage(lookupKey, { version: parsedVersion });
   } catch (error) {
      normalizeEngineError(error);
   }
}

interface InspectApplicableTargetResult {
   version: WcagVersion;
   target: { kind: string; value: string };
   signals: ReturnType<typeof deriveApplicabilityInputFromHtml>['signals'];
   matrix: ReturnType<typeof listApplicableCriteria>;
}

/** Runs applicability analysis for a resolved target input. */
export async function inspectApplicableTarget(
   targetInput: ResolveDocumentTargetInput,
   version: string,
): Promise<InspectApplicableTargetResult> {
   const parsedVersion = parseWcagVersion(version);
   const resolved = await resolveDocumentTarget(targetInput);
   const input = deriveApplicabilityInputFromHtml(resolved.resolvedUrl, resolved.html, {
      target: resolved.target,
      metadata: resolved.metadata,
      userHints: resolved.userHints,
   });

   try {
      return {
         version: parsedVersion,
         target: input.target,
         signals: input.signals,
         matrix: listApplicableCriteria(input, { version: parsedVersion }),
      };
   } catch (error) {
      normalizeEngineError(error);
   }
}

/** Runs applicability analysis for one live URL target. */
export async function inspectApplicableUrl(
   url: string,
   version: string,
): Promise<InspectApplicableTargetResult> {
   return inspectApplicableTarget({ url }, version);
}

type CriterionApplicabilityResult = ReturnType<typeof getCriterionApplicability> & {
   signals: ReturnType<typeof deriveApplicabilityInputFromHtml>['signals'];
};

/** Explains the applicability state of one criterion for a resolved target. */
export async function inspectCriterionTarget(
   lookupKey: CriterionLookupKey,
   targetInput: ResolveDocumentTargetInput,
   version: string,
): Promise<CriterionApplicabilityResult> {
   const parsedVersion = parseWcagVersion(version);

   try {
      getCriterion(lookupKey, { version: parsedVersion });
   } catch (error) {
      normalizeEngineError(error);
   }

   const resolved = await resolveDocumentTarget(targetInput);
   const input = deriveApplicabilityInputFromHtml(resolved.resolvedUrl, resolved.html, {
      target: resolved.target,
      metadata: resolved.metadata,
      userHints: resolved.userHints,
   });

   try {
      return {
         ...getCriterionApplicability(lookupKey, input, { version: parsedVersion }),
         signals: input.signals,
      };
   } catch (error) {
      normalizeEngineError(error);
   }
}

/** Explains the applicability state of one criterion for a live URL target. */
export async function inspectCriterionUrl(
   lookupKey: CriterionLookupKey,
   url: string,
   version: string,
): Promise<CriterionApplicabilityResult> {
   return inspectCriterionTarget(lookupKey, { url }, version);
}
