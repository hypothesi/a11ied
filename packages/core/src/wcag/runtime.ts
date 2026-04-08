import {
   wcagLevelSchema,
   wcagVersionSchema,
   type CriterionLookupKey,
   type WcagLevel,
   type WcagVersion,
} from '@a11lied/contracts';
import {
   WcagEngineNotFoundError,
   WcagEngineValidationError,
   getCoverage,
   getCriterion,
   getCriterionApplicability,
   listApplicableCriteria,
   listCriteriaByLevel,
   searchCriteria,
} from '@a11lied/wcag-engine';

import { deriveApplicabilityInputFromHtml } from '../applicability/html.js';
import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';
import {
   resolveDocumentTarget,
   type ResolveDocumentTargetInput,
} from '../targets/runtime.js';

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

function parseVersion(version: string): WcagVersion {
   const parsed = wcagVersionSchema.safeParse(version);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         `WCAG version "${version}" is unsupported.`,
         {
            field: 'version',
            value: version,
            supportedVersions: [...wcagVersionSchema.options],
         },
      );
   }

   return parsed.data;
}

function parseLevel(level: string): WcagLevel {
   const parsed = wcagLevelSchema.safeParse(level);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         `WCAG level "${level}" is unsupported.`,
         {
            field: 'level',
            value: level,
            supportedLevels: [...wcagLevelSchema.options],
         },
      );
   }

   return parsed.data;
}

export function listWcagLevels(version: string): {
   version: WcagVersion;
   levels: WcagLevel[];
} {
   return {
      version: parseVersion(version),
      levels: [...wcagLevelSchema.options],
   };
}

export function listWcagCriteria(
   level: string,
   version: string,
): ReturnType<typeof listCriteriaByLevel> {
   const parsedLevel = parseLevel(level);
   const parsedVersion = parseVersion(version);

   try {
      return listCriteriaByLevel(parsedLevel, parsedVersion);
   } catch (error) {
      normalizeEngineError(error);
   }
}

export function showWcagCriterion(
   lookupKey: CriterionLookupKey,
   version: string,
): ReturnType<typeof getCriterion> {
   const parsedVersion = parseVersion(version);

   try {
      return getCriterion(lookupKey, { version: parsedVersion });
   } catch (error) {
      normalizeEngineError(error);
   }
}

export function searchWcagCriteria(
   query: string,
   options: { version: string; limit: number },
): ReturnType<typeof searchCriteria> {
   const parsedVersion = parseVersion(options.version);
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

export function showWcagCoverage(
   lookupKey: CriterionLookupKey,
   version: string,
): ReturnType<typeof getCoverage> {
   const parsedVersion = parseVersion(version);

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

export async function inspectApplicableTarget(
   targetInput: ResolveDocumentTargetInput,
   version: string,
): Promise<InspectApplicableTargetResult> {
   const parsedVersion = parseVersion(version);
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

export async function inspectApplicableUrl(
   url: string,
   version: string,
): Promise<InspectApplicableTargetResult> {
   return inspectApplicableTarget({ url }, version);
}

type CriterionApplicabilityResult = ReturnType<typeof getCriterionApplicability> & {
   signals: ReturnType<typeof deriveApplicabilityInputFromHtml>['signals'];
};

export async function inspectCriterionTarget(
   lookupKey: CriterionLookupKey,
   targetInput: ResolveDocumentTargetInput,
   version: string,
): Promise<CriterionApplicabilityResult> {
   const parsedVersion = parseVersion(version);

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

export async function inspectCriterionUrl(
   lookupKey: CriterionLookupKey,
   url: string,
   version: string,
): Promise<CriterionApplicabilityResult> {
   return inspectCriterionTarget(lookupKey, { url }, version);
}
