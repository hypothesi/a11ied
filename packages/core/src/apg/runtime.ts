import type {
   ApgExampleShowResult,
   UnifiedSearchResult,
   UnifiedSearchRow,
   ApgLookupResult,
   ApgFindResult,
   ApgLookupKey,
   ApgPatternListResult,
   ApgPatternShowResult,
} from '@a11ied/contracts';
import {
   searchApgEntries,
   searchCriteria,
   findApgExamplesByAttribute,
   findApgExamplesByRole,
   getApgDocument,
   getApgExample,
   getApgPattern,
   listApgExamplesForPattern,
   listApgIndexKeys,
   listApgPatterns,
   resolveApgLookupKey,
} from '@a11ied/wcag-engine';

import { CliUsageError } from '../errors/cli-errors.js';
import { normalizeEngineError } from '../errors/engine-errors.js';

const SUGGESTION_LIMIT = 5;
const DEFAULT_SEARCH_LIMIT = 10;

function listSuggestions(key: string): string[] {
   const wanted = key.trim().toLowerCase();
   const names = listApgPatterns().map((pattern) => pattern.id);
   return names.filter((name) => name.includes(wanted)).slice(0, SUGGESTION_LIMIT);
}

/**
 * Resolves a bare `a1 pattern <name>` argument to the pattern or example it names.
 *
 * A name that matches neither raises a usage error rather than an empty result, and
 * offers the pattern ids that contain the text as suggestions.
 */
export function resolveApgLookup(key: string): ApgLookupKey {
   const resolved = resolveApgLookupKey(key);
   if (resolved) {
      return resolved;
   }
   throw new CliUsageError(
      'pattern-not-found',
      `No ARIA pattern or example named "${key}".`,
      { lookupKey: key, suggestions: listSuggestions(key) },
   );
}

/** Shows one APG pattern with every example the guide publishes for it. */
export function showApgPattern(patternId: string): ApgPatternShowResult {
   try {
      return {
         document: getApgDocument(),
         pattern: getApgPattern(patternId),
         examples: listApgExamplesForPattern(patternId),
      };
   } catch (error) {
      return normalizeEngineError(error);
   }
}

/** Shows one APG example: its keyboard tables, its attribute tables, and its source page. */
export function showApgExample(exampleId: string): ApgExampleShowResult {
   try {
      const example = getApgExample(exampleId);
      return {
         document: getApgDocument(),
         example,
         pattern: getApgPattern(example.patternId),
      };
   } catch (error) {
      return normalizeEngineError(error);
   }
}

/**
 * Shows whichever the name resolves to. Both the lookup and the failure happen here, so
 * the command layer never has to resolve a name before it has an error handler in place.
 */
export function showApgPatternOrExample(name: string): ApgLookupResult {
   const resolved = resolveApgLookup(name);
   if (resolved.kind === 'example') {
      return { kind: 'example', ...showApgExample(resolved.id) };
   }
   return { kind: 'pattern', ...showApgPattern(resolved.id) };
}

/** Lists every APG pattern with the number of examples the guide publishes for it. */
export function listApgPatternSummaries(): ApgPatternListResult {
   return { document: getApgDocument(), patterns: listApgPatterns() };
}

/**
 * Lists the examples the APG's example index files under one role or one attribute.
 *
 * A key the index does not list raises a usage error naming the keys it does, because an
 * empty result reads the same as a typo.
 */
export function findApgExamples(input: {
   role?: string | undefined;
   attribute?: string | undefined;
}): ApgFindResult {
   const key = input.role ?? input.attribute,
      kind = input.role === undefined ? 'attribute' : 'role';

   if (key === undefined || key.trim().length === 0) {
      throw new CliUsageError(
         'missing-lookup-key',
         'Name a role or an attribute to look up.',
      );
   }

   const examples =
      kind === 'role' ? findApgExamplesByRole(key) : findApgExamplesByAttribute(key);

   if (examples.length === 0) {
      const known = listApgIndexKeys();
      throw new CliUsageError(
         'pattern-index-key-not-found',
         `The APG example index lists no examples for the ${kind} "${key}".`,
         {
            lookupKey: key,
            supportedKeys: kind === 'role' ? known.roles : known.attributes,
         },
      );
   }

   return {
      document: getApgDocument(),
      key,
      kind,
      examples: examples.map((example) => ({
         id: example.id,
         patternId: example.patternId,
         title: example.title,
         pageUrl: example.pageUrl,
      })),
   };
}

/**
 * Searches the WCAG corpus and the APG corpus and merges them into one ranked list.
 *
 * A person searching for "combobox" wants the ARIA pattern, the criteria it bears on, and
 * the axe rule in one place, so there is one search command rather than one per corpus.
 * `kind` filters to a single corpus.
 */
export function searchAll(
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
