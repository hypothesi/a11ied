import {
   wcagLevelSchema,
   type AxeRuleLookupResult,
   type CoverageSummaryArtifact,
   type CriterionLookupKey,
   type EvidenceStrategy,
   type TechniqueLookupResult,
   type WcagLevel,
   type WcagVersion,
} from '@a11ied/contracts';
import {
   WcagEngineNotFoundError,
   WcagEngineValidationError,
   getAxeRule,
   getCoverage,
   getCoverageSummary,
   getCriterionApplicability,
   getTechnique,
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

/** Returns the pinned coverage totals per conformance level for one WCAG version. */
export function showWcagCoverageSummary(version: string): CoverageSummaryArtifact {
   return getCoverageSummary({ version: parseWcagVersion(version) });
}

/** Returns coverage and testing-strategy metadata for one criterion. */
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

/**
 * Resolves one criterion by id or slug for the requested WCAG version, together with its
 * coverage state and testing strategy.
 */
export function showWcagCriterion(
   lookupKey: CriterionLookupKey,
   version: string,
): ReturnType<typeof getCoverage> {
   return showWcagCoverage(lookupKey, version);
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

/** Resolves one W3C technique or failure id (G18, F65) to the criteria that list it. */
export function showWcagTechnique(
   lookupKey: string,
   version: string,
): TechniqueLookupResult {
   const parsedVersion = parseWcagVersion(version);

   try {
      return getTechnique(lookupKey, { version: parsedVersion });
   } catch (error) {
      normalizeEngineError(error);
   }
}

async function loadAxeRuleHelp(
   ruleId: string,
): Promise<Pick<AxeRuleLookupResult, 'description' | 'help' | 'helpUrl'>> {
   const { default: axeCore } = await import('axe-core');
   const rule = axeCore.getRules().find((entry) => entry.ruleId === ruleId);
   if (!rule) {
      return {};
   }
   return { description: rule.description, help: rule.help, helpUrl: rule.helpUrl };
}

/**
 * Maps one axe-core rule id to the criteria it covers in the pinned data. The rule's help
 * text and help URL come from the installed axe-core package, not from the data, so they
 * follow the axe-core version in use.
 */
export async function showWcagAxeRule(
   ruleId: string,
   version: string,
): Promise<AxeRuleLookupResult> {
   const parsedVersion = parseWcagVersion(version);
   let lookup: AxeRuleLookupResult | undefined = undefined;

   try {
      lookup = getAxeRule(ruleId, { version: parsedVersion });
   } catch (error) {
      normalizeEngineError(error);
   }

   return { ...lookup, ...(await loadAxeRuleHelp(ruleId)) };
}

function listStrategies(
   criterionIds: string[],
   version: WcagVersion,
): Record<string, EvidenceStrategy> {
   return Object.fromEntries(
      criterionIds.map((criterionId) => [
         criterionId,
         getCoverage(criterionId, { version }).strategy,
      ]),
   );
}

interface InspectApplicableTargetResult {
   version: WcagVersion;
   target: { kind: string; value: string };
   signals: ReturnType<typeof deriveApplicabilityInputFromHtml>['signals'];
   matrix: ReturnType<typeof listApplicableCriteria>;
   strategies: Record<string, EvidenceStrategy>;
}

/**
 * Runs applicability analysis for a resolved target input. The result carries the testing
 * strategy of every assessed criterion so renderers can name the next command.
 */
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
      const matrix = listApplicableCriteria(input, { version: parsedVersion });
      return {
         version: parsedVersion,
         target: input.target,
         signals: input.signals,
         matrix,
         strategies: listStrategies(Object.keys(matrix.assessments), parsedVersion),
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
   strategy: EvidenceStrategy;
};

/** Explains the applicability state of one criterion for a resolved target. */
export async function inspectCriterionTarget(
   lookupKey: CriterionLookupKey,
   targetInput: ResolveDocumentTargetInput,
   version: string,
): Promise<CriterionApplicabilityResult> {
   const parsedVersion = parseWcagVersion(version);
   let strategy: EvidenceStrategy | undefined = undefined;

   try {
      strategy = getCoverage(lookupKey, { version: parsedVersion }).strategy;
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
         strategy,
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
