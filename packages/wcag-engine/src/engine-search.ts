import {
   criterionSearchResponseSchema,
   type CriterionSearchMatch,
   type CriterionSearchResponse,
   type CriterionSearchResult,
   type NormalizedCriterion,
} from '@a11lied/contracts';

import { searchableFieldWeights, type SearchableField } from './engine-data.js';
import { getArtifacts, parseVersion } from './engine-artifacts.js';

const SUFFIX_IES_LENGTH = 3;
const SUFFIX_ES_LENGTH = 2;
const PHRASE_BONUS = 0.5;
const TOFIX_PRECISION = 4;

function normalizeText(value: string): string {
   return value
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, ' ')
      .trim();
}

function normalizeToken(value: string): string {
   const normalized = normalizeText(value);
   if (normalized.endsWith('ies') && normalized.length > SUFFIX_IES_LENGTH) {
      return `${normalized.slice(0, -SUFFIX_IES_LENGTH)}y`;
   }
   if (normalized.endsWith('es') && normalized.length > SUFFIX_IES_LENGTH) {
      return normalized.slice(0, -SUFFIX_ES_LENGTH);
   }
   if (normalized.endsWith('s') && normalized.length > SUFFIX_ES_LENGTH) {
      return normalized.slice(0, -1);
   }
   return normalized;
}

function tokenize(value: string): string[] {
   return normalizeText(value)
      .split(/\s+/)
      .map((token) => normalizeToken(token))
      .filter((token) => token.length > 0);
}

interface FieldMatchInput {
   field: SearchableField;
   value: string;
   queryTokens: string[];
   normalizedQuery: string;
}

interface FieldScoreInput {
   field: SearchableField;
   matchedCount: number;
   queryTokenCount: number;
   includesPhrase: boolean;
}

function computeFieldScore(input: FieldScoreInput): number {
   let phraseBonus = 0;
   if (input.includesPhrase) {
      phraseBonus = PHRASE_BONUS;
   }
   const rawScore =
      searchableFieldWeights[input.field] *
      (input.matchedCount / Math.max(input.queryTokenCount, 1) + phraseBonus);
   return Number(rawScore.toFixed(TOFIX_PRECISION));
}

function createFieldMatch(input: FieldMatchInput): CriterionSearchMatch | undefined {
   if (!input.value.trim()) {
      return undefined;
   }

   const fieldTokens = tokenize(input.value);
   const matchedCount = input.queryTokens.filter((token) =>
      fieldTokens.includes(token),
   ).length;
   const normalizedValue = normalizeText(input.value);

   if (matchedCount === 0 && !normalizedValue.includes(input.normalizedQuery)) {
      return undefined;
   }

   return {
      field: input.field,
      text: input.value,
      score: computeFieldScore({
         field: input.field,
         matchedCount,
         queryTokenCount: input.queryTokens.length,
         includesPhrase: normalizedValue.includes(input.normalizedQuery),
      }),
   };
}

function buildSearchMatches(
   criterion: NormalizedCriterion,
   query: string,
): CriterionSearchMatch[] {
   const normalizedQuery = normalizeText(query);
   const queryTokens = tokenize(query);

   const fieldValues: Array<[SearchableField, string[]]> = [
      ['title', [criterion.title]],
      ['summary', [criterion.summary]],
      ['normativeText', [criterion.normativeText]],
      ['details', criterion.details],
      [
         'technique',
         [...criterion.techniques, ...criterion.advisoryTechniques].map(
            (entry) => entry.title,
         ),
      ],
      ['failure', criterion.failures.map((entry) => entry.title)],
      ['tag', criterion.tags],
      ['guideline', [criterion.guideline.title]],
      ['principle', [criterion.principle.title]],
   ];

   const matches = fieldValues.flatMap(([field, values]) =>
      values
         .map((value) => createFieldMatch({ field, value, queryTokens, normalizedQuery }))
         .filter((value): value is CriterionSearchMatch => value !== undefined),
   );

   return matches.toSorted(
      (left, right) => right.score - left.score || left.field.localeCompare(right.field),
   );
}

export function searchCriteria(
   query: string,
   options?: { version?: string; limit?: number },
): CriterionSearchResponse {
   const version = parseVersion(options?.version);
   const limit = options?.limit ?? 10;
   const artifacts = getArtifacts(version);

   const results = Object.values(artifacts.criteria)
      .flatMap((criterion) => {
         const matches = buildSearchMatches(criterion, query);
         const score = matches.reduce((total, match) => total + match.score, 0);

         if (matches.length === 0 || score <= 0) {
            return [];
         }

         return [
            {
               criterionId: criterion.id,
               slug: criterion.slug,
               title: criterion.title,
               level: criterion.level,
               wcagVersion: criterion.wcagVersion,
               score: Number(score.toFixed(TOFIX_PRECISION)),
               matches,
            } satisfies CriterionSearchResult,
         ];
      })
      .toSorted(
         (left, right) =>
            right.score - left.score ||
            right.matches.length - left.matches.length ||
            left.criterionId.localeCompare(right.criterionId, undefined, {
               numeric: true,
            }),
      )
      .slice(0, limit);

   return criterionSearchResponseSchema.parse({
      query,
      results,
   });
}
