import type { UnifiedSearchRow } from '@a11ied/contracts';

import { getApgArtifact } from '../artifacts/apg.js';
import { normalizeText, tokenize } from './text.js';

/**
 * How much each APG field is worth. A title match is what a person searching for
 * "combobox" means; a match inside a key's description or an attribute's usage text is a
 * weaker signal.
 */
const APG_FIELD_WEIGHTS = {
   patternTitle: 8,
   exampleTitle: 7,
   patternId: 6,
   role: 5,
   attribute: 4,
   description: 2,
} as const;

type ApgField = keyof typeof APG_FIELD_WEIGHTS;

const PHRASE_BONUS = 0.5;
const TOFIX_PRECISION = 4;

interface ScoredField {
   field: ApgField;
   text: string;
   score: number;
}

function scoreField(input: {
   field: ApgField;
   value: string;
   queryTokens: string[];
   normalizedQuery: string;
}): ScoredField | undefined {
   if (input.value.trim().length === 0) {
      return undefined;
   }

   const fieldTokens = tokenize(input.value);
   const matchedCount = input.queryTokens.filter((token) =>
      fieldTokens.includes(token),
   ).length;
   const includesPhrase = normalizeText(input.value).includes(input.normalizedQuery);

   if (matchedCount === 0 && !includesPhrase) {
      return undefined;
   }

   const phraseBonus = includesPhrase ? PHRASE_BONUS : 0;
   const raw =
      APG_FIELD_WEIGHTS[input.field] *
      (matchedCount / Math.max(input.queryTokens.length, 1) + phraseBonus);

   return {
      field: input.field,
      text: input.value,
      score: Number(raw.toFixed(TOFIX_PRECISION)),
   };
}

function best(fields: Array<ScoredField | undefined>): ScoredField | undefined {
   return fields
      .filter((entry) => entry !== undefined)
      .toSorted((left, right) => right.score - left.score)
      .at(0);
}

function buildRow(input: {
   kind: 'pattern' | 'example';
   id: string;
   title: string;
   context: string;
   scored: ScoredField;
}): UnifiedSearchRow {
   return {
      kind: input.kind,
      id: input.id,
      title: input.title,
      score: input.scored.score,
      context: input.context,
      matchedOn: input.scored.text,
   };
}

function scorePatterns(
   artifact: ReturnType<typeof getApgArtifact>,
   queryTokens: string[],
   normalizedQuery: string,
): UnifiedSearchRow[] {
   const rows: UnifiedSearchRow[] = [];

   for (const pattern of Object.values(artifact.patterns)) {
      const scored = best([
         scoreField({
            field: 'patternTitle',
            value: pattern.title,
            queryTokens,
            normalizedQuery,
         }),
         scoreField({
            field: 'patternId',
            value: pattern.id,
            queryTokens,
            normalizedQuery,
         }),
      ]);
      if (scored) {
         rows.push(
            buildRow({
               kind: 'pattern',
               id: pattern.id,
               title: pattern.title,
               context: `${pattern.exampleIds.length} examples`,
               scored,
            }),
         );
      }
   }

   return rows;
}

function scoreExamples(
   artifact: ReturnType<typeof getApgArtifact>,
   queryTokens: string[],
   normalizedQuery: string,
): UnifiedSearchRow[] {
   const rows: UnifiedSearchRow[] = [];

   for (const example of Object.values(artifact.examples)) {
      const usage = example.attributeTables.flatMap((table) =>
         table.rows.map((row) => row.usage),
      );
      const scored = best([
         scoreField({
            field: 'exampleTitle',
            value: example.title,
            queryTokens,
            normalizedQuery,
         }),
         scoreField({
            field: 'patternId',
            value: example.id,
            queryTokens,
            normalizedQuery,
         }),
         ...usage.map((value) =>
            scoreField({ field: 'description', value, queryTokens, normalizedQuery }),
         ),
      ]);
      if (scored) {
         rows.push(
            buildRow({
               kind: 'example',
               id: example.id,
               title: example.title,
               context: `${example.patternId} pattern`,
               scored,
            }),
         );
      }
   }

   return rows;
}

/** Searches the APG patterns and examples and returns ranked rows. */
export function searchApgEntries(query: string, limit: number): UnifiedSearchRow[] {
   const artifact = getApgArtifact();
   const normalizedQuery = normalizeText(query);
   const queryTokens = tokenize(query);

   return [
      ...scorePatterns(artifact, queryTokens, normalizedQuery),
      ...scoreExamples(artifact, queryTokens, normalizedQuery),
   ]
      .toSorted((left, right) => right.score - left.score)
      .slice(0, limit);
}
