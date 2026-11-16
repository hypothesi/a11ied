import type {
   ApgExample,
   AssessmentProcedure,
   ProcedureCoverage,
   UnifiedSearchResult,
   UnifiedSearchRow,
} from '@a11ied/contracts';
import {
   findApgExamplesByAttribute,
   findApgExamplesByRole,
   getApgDocument,
   getApgExample,
   getApgPattern,
   getAxeRule,
   getCriterion,
   getCriterionRelevance,
   getMobileGuidance,
   getQuickrefTags,
   getTechnique,
   getTestMethod,
   getTestMethodSummary,
   getUnderstanding,
   listApgExamplesForPattern,
   listApgIndexKeys,
   listApgPatterns,
   listCriteriaByLevel,
   listRelevantCriteria,
   resetWcagEngineCache,
   resolveApgLookupKey,
   searchApgEntries,
   searchCriteria,
   supportedPageSignalCategories,
   supportedRelevanceStates,
   WcagEngineNotFoundError,
   WcagEngineValidationError,
} from '@a11ied/wcag-engine';

export {
   inferRelevantCriteriaFromHtml,
   scanHtmlForPageSignals,
   type PageScanSignals,
} from './html.js';

export {
   findApgExamplesByAttribute,
   findApgExamplesByRole,
   getApgDocument,
   getApgExample,
   getApgPattern,
   getApgPattern as getPattern,
   getAxeRule,
   getCriterion,
   getCriterionRelevance,
   getMobileGuidance,
   getQuickrefTags,
   getTechnique,
   getTestMethod,
   getTestMethodSummary,
   getUnderstanding,
   listApgExamplesForPattern,
   listApgIndexKeys,
   listApgPatterns,
   listApgPatterns as listPatterns,
   listCriteriaByLevel,
   listRelevantCriteria,
   resetWcagEngineCache,
   resolveApgLookupKey,
   searchApgEntries,
   searchCriteria,
   searchCriteria as searchWcag,
   supportedPageSignalCategories,
   supportedRelevanceStates,
   WcagEngineNotFoundError,
   WcagEngineValidationError,
};

export function findPatterns(input: { role?: string; attribute?: string }): ApgExample[] {
   if (input.role) {
      return findApgExamplesByRole(input.role);
   }
   if (input.attribute) {
      return findApgExamplesByAttribute(input.attribute);
   }
   return [];
}

const DEFAULT_SEARCH_LIMIT = 20;

export function unifiedSearch(
   query: string,
   options?: { version?: string; limit?: number; kind?: UnifiedSearchRow['kind'] },
): UnifiedSearchResult {
   const limit = options?.limit ?? DEFAULT_SEARCH_LIMIT;
   const criterionRows: UnifiedSearchRow[] = [];
   const found = searchCriteria(query, {
      ...(options?.version === undefined ? {} : { version: options.version }),
      limit,
   });

   for (const result of found.results) {
      const row: UnifiedSearchRow = {
         kind: 'criterion',
         id: result.criterionId,
         title: result.title,
         score: result.score,
         context: `Level ${result.level}`,
      };
      const first = result.matches[0];
      if (first) {
         row.matchedOn = first.text;
      }
      criterionRows.push(row);
   }

   const rows = [...criterionRows, ...searchApgEntries(query, limit)]
      .filter((row) => options?.kind === undefined || row.kind === options.kind)
      .toSorted((left, right) => right.score - left.score)
      .slice(0, limit);

   return { query, rows };
}

export function validateProcedureCoverage(version = '2.2'): ProcedureCoverage {
   return (
      getTestMethodSummary({ version }).procedureCoverage ?? {
         definedCriterionIds: [],
         gapCriterionIds: [],
      }
   );
}

export function listProceduresForCriteria(
   criterionId: string,
   options?: { version?: string },
): AssessmentProcedure[] {
   return getTestMethod(criterionId, options).strategy.procedures;
}
