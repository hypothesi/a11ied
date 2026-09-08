import {
   wcagLevelSchema,
   type AxeRuleLookupResult,
   type TestMethodLookupResult,
   type TestMethodSummaryArtifact,
   type CriterionLookupKey,
   type CriterionShowResult,
   type EvidenceStrategy,
   type TechniqueLookupResult,
   type UnderstandingLookupResult,
   type WcagLevel,
   type WcagVersion,
} from '@a11ied/contracts';
import {
   WcagEngineNotFoundError,
   WcagEngineValidationError,
   getAxeRule,
   getTestMethod,
   getTestMethodSummary,
   getCriterionRelevance,
   getTechnique,
   getUnderstanding,
   listRelevantCriteria,
   listCriteriaByLevel,
   searchCriteria,
} from '@a11ied/wcag-engine';

import { scanHtmlForPageSignals } from '../relevance/html.js';
import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';
import {
   resolveDocumentTarget,
   type ResolveDocumentTargetInput,
} from '../targets/runtime.js';
import { excerptUnderstanding } from './excerpt.js';
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

/** Returns the pinned test method counts per conformance level for one WCAG version. */
export function showWcagTestMethodSummary(version: string): TestMethodSummaryArtifact {
   return getTestMethodSummary({ version: parseWcagVersion(version) });
}

/** Returns the test method record and testing strategy for one criterion. */
export function showWcagTestMethod(
   lookupKey: CriterionLookupKey,
   version: string,
): TestMethodLookupResult {
   const parsedVersion = parseWcagVersion(version);

   try {
      return getTestMethod(lookupKey, { version: parsedVersion });
   } catch (error) {
      normalizeEngineError(error);
   }
}

interface UnderstandingSummary {
   excerpt: string | undefined;
   source: { title: string; url: string; status: string } | undefined;
}

/** The opening of one Understanding document, with the attribution its copies carry. */
function findUnderstanding(
   lookupKey: CriterionLookupKey,
   version: WcagVersion,
): UnderstandingSummary {
   try {
      const result = getUnderstanding(lookupKey, { version });
      return {
         excerpt: excerptUnderstanding(result.body),
         source: {
            title: result.document.title,
            url: result.document.url,
            status: result.document.status,
         },
      };
   } catch {
      return { excerpt: undefined, source: undefined };
   }
}

/**
 * Resolves one criterion by id or slug for the requested WCAG version, together with its
 * test method, testing strategy, and a short excerpt of its Understanding document. Print
 * the full document with `a1 wcag understanding <id>`.
 */
export function showWcagCriterion(
   lookupKey: CriterionLookupKey,
   version: string,
): CriterionShowResult {
   const testMethod = showWcagTestMethod(lookupKey, version);
   const understanding = findUnderstanding(lookupKey, testMethod.criterion.wcagVersion);
   return {
      ...testMethod,
      understandingExcerpt: understanding.excerpt,
      understandingSource: understanding.source,
   };
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

/** Returns one criterion's full Understanding document by id or slug. */
export function showWcagUnderstanding(
   lookupKey: CriterionLookupKey,
   version: string,
): UnderstandingLookupResult {
   const parsedVersion = parseWcagVersion(version);

   try {
      return getUnderstanding(lookupKey, { version: parsedVersion });
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
         getTestMethod(criterionId, { version }).strategy,
      ]),
   );
}

interface InspectRelevantCriteriaTargetResult {
   version: WcagVersion;
   target: { kind: string; value: string };
   signals: ReturnType<typeof scanHtmlForPageSignals>['signals'];
   matrix: ReturnType<typeof listRelevantCriteria>;
   strategies: Record<string, EvidenceStrategy>;
}

/**
 * Runs the relevant criteria scan for a resolved target input. The result carries the
 * testing strategy of every assessed criterion so renderers can name the next command.
 */
export async function inspectRelevantCriteriaTarget(
   targetInput: ResolveDocumentTargetInput,
   version: string,
): Promise<InspectRelevantCriteriaTargetResult> {
   const parsedVersion = parseWcagVersion(version);
   const resolved = await resolveDocumentTarget(targetInput);
   const html = await resolved.readHtml();
   const input = scanHtmlForPageSignals(resolved.target.value, html, {
      target: resolved.target,
      metadata: resolved.metadata,
      userHints: resolved.userHints,
   });

   try {
      const matrix = listRelevantCriteria(input, { version: parsedVersion });
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

/** Runs the relevant criteria scan for one live URL target. */
export async function inspectRelevantCriteriaUrl(
   url: string,
   version: string,
): Promise<InspectRelevantCriteriaTargetResult> {
   return inspectRelevantCriteriaTarget({ url }, version);
}

type CriterionRelevanceResult = ReturnType<typeof getCriterionRelevance> & {
   signals: ReturnType<typeof scanHtmlForPageSignals>['signals'];
   strategy: EvidenceStrategy;
};

/** Explains the relevance state of one criterion for a resolved target. */
export async function inspectCriterionTarget(
   lookupKey: CriterionLookupKey,
   targetInput: ResolveDocumentTargetInput,
   version: string,
): Promise<CriterionRelevanceResult> {
   const parsedVersion = parseWcagVersion(version);
   let strategy: EvidenceStrategy | undefined = undefined;

   try {
      strategy = getTestMethod(lookupKey, { version: parsedVersion }).strategy;
   } catch (error) {
      normalizeEngineError(error);
   }

   const resolved = await resolveDocumentTarget(targetInput);
   const html = await resolved.readHtml();
   const input = scanHtmlForPageSignals(resolved.target.value, html, {
      target: resolved.target,
      metadata: resolved.metadata,
      userHints: resolved.userHints,
   });

   try {
      return {
         ...getCriterionRelevance(lookupKey, input, { version: parsedVersion }),
         signals: input.signals,
         strategy,
      };
   } catch (error) {
      normalizeEngineError(error);
   }
}

/** Explains the relevance state of one criterion for a live URL target. */
export async function inspectCriterionUrl(
   lookupKey: CriterionLookupKey,
   url: string,
   version: string,
): Promise<CriterionRelevanceResult> {
   return inspectCriterionTarget(lookupKey, { url }, version);
}
