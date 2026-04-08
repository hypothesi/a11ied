import type {
   ApplicabilitySignal,
   ApplicabilitySignalCategory,
   CriterionApplicability,
   NormalizedCriterion,
} from '@a11lied/contracts';

import {
   applicabilitySignalTagHints,
   directCriterionCategoryHints,
   interactiveFallbackTags,
} from './data.js';

const FORMAT_LIST_PAIR_LENGTH = 2;

export function dedupe<TValue>(values: TValue[]): TValue[] {
   return [...new Set(values)];
}

export function formatList(values: string[]): string {
   if (values.length === 0) {
      return '';
   }
   const first = values[0];
   if (first === undefined) {
      return '';
   }
   if (values.length === 1) {
      return first;
   }
   if (values.length === FORMAT_LIST_PAIR_LENGTH) {
      return `${values[0]} and ${values[1]}`;
   }
   return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

export function buildNotDetected(
   criterionId: string,
   reason: string,
): CriterionApplicability {
   return {
      criterionId,
      state: 'not-detected',
      reasons: [reason],
      matchedSignalCategories: [],
      matchedTags: [],
   };
}

export function getMatchedCategories(
   criterion: NormalizedCriterion,
   signals: ApplicabilitySignal[],
): ApplicabilitySignalCategory[] {
   const categories = dedupe(signals.map((signal) => signal.category));
   const tagDriven = categories.filter((category) =>
      applicabilitySignalTagHints[category].some((tag) => criterion.tags.includes(tag)),
   );
   const direct = (directCriterionCategoryHints[criterion.id] ?? []).filter((category) =>
      categories.includes(category),
   );

   return dedupe([...tagDriven, ...direct]);
}

export function getMatchedTags(
   criterion: NormalizedCriterion,
   matchedCategories: ApplicabilitySignalCategory[],
): string[] {
   return dedupe(
      matchedCategories.flatMap((category) =>
         applicabilitySignalTagHints[category].filter((tag) =>
            criterion.tags.includes(tag),
         ),
      ),
   );
}

export function getInteractiveUnknownAssessment(
   criterion: NormalizedCriterion,
   matchedTags: string[],
): CriterionApplicability | undefined {
   const criterionLooksInteractive = criterion.tags.some((tag) =>
      interactiveFallbackTags.has(tag),
   );

   if (!criterionLooksInteractive) {
      return undefined;
   }

   return {
      criterionId: criterion.id,
      state: 'unknown',
      reasons: [
         `Detected a custom widget signal, but no recognized form, dialog, media, menu, or authentication-flow signals. Applicability for this interactive criterion stays unresolved.`,
      ],
      matchedSignalCategories: ['widget'],
      matchedTags,
   };
}
