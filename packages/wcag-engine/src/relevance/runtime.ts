import {
   pageScanSchema,
   relevanceMatrixSchema,
   criterionRelevanceLookupResultSchema,
   type PageScan,
   type RelevanceMatrix,
   type PageSignal,
   type PageSignalCategory,
   type CriterionRelevance,
   type CriterionRelevanceLookupResult,
   type CriterionLookupKey,
   type NormalizedCriterion,
} from '@a11ied/contracts';

import { getArtifacts, parseVersion, resolveCriterion } from '../artifacts/runtime.js';
import {
   buildNotDetected,
   collectSignalElements,
   dedupe,
   formatList,
   getInteractiveUnknownAssessment,
   getMatchedCategories,
   getMatchedTags,
} from '../shared/utils.js';
import { categoryReasonLabels, strongPageSignalCategories } from '../shared/data.js';

const MAX_SIGNAL_VALUES = 4;

interface RelevanceContext {
   criterion: NormalizedCriterion;
   signals: PageSignal[];
   matchedSignals: PageSignal[];
   matchedCategories: PageSignalCategory[];
   matchedTags: string[];
   signalValues: string[];
   signalLabels: string[];
}

function evaluateAuthCriterion(ctx: RelevanceContext): CriterionRelevance {
   const authSignals = ctx.signals.filter((signal) => signal.category === 'auth');
   const authTags = getMatchedTags(ctx.criterion, ['auth']);

   if (authSignals.length > 0) {
      return {
         criterionId: ctx.criterion.id,
         title: ctx.criterion.title,
         state: 'relevant',
         reasons: [
            `Detected authentication signals (${formatList(authSignals.map((signal) => signal.value))}) and matching criterion tags (${formatList(authTags)}).`,
         ],
         matchedSignalCategories: ['auth'],
         matchedTags: authTags,
         elements: collectSignalElements(authSignals),
      };
   }

   return buildNotDetected(
      ctx.criterion,
      'No authentication-flow signals were detected for this target.',
   );
}

function evaluateStatusWithLiveRegion(
   ctx: RelevanceContext,
): CriterionRelevance | undefined {
   const statusSignals = ctx.signals.filter(
      (signal) => signal.category === 'live-region',
   );
   if (statusSignals.length === 0) {
      return undefined;
   }

   const statusTags = getMatchedTags(ctx.criterion, [
      'live-region',
      'form',
      'validation',
   ]);
   return {
      criterionId: ctx.criterion.id,
      title: ctx.criterion.title,
      state: 'relevant',
      reasons: [
         `Detected live region signals (${formatList(statusSignals.map((signal) => signal.value))}) and matching criterion tags (${formatList(statusTags)}).`,
      ],
      matchedSignalCategories: dedupe([
         ...statusSignals.map((signal) => signal.category),
         ...ctx.matchedCategories,
      ]),
      matchedTags: statusTags,
      elements: collectSignalElements(statusSignals),
   };
}

function evaluateStatusCriterion(ctx: RelevanceContext): CriterionRelevance {
   const result = evaluateStatusWithLiveRegion(ctx);
   if (result) {
      return result;
   }

   return buildNotDetected(
      ctx.criterion,
      'No live region or equivalent status signal was detected for this target.',
   );
}

function evaluateDefaultCriterion(ctx: RelevanceContext): CriterionRelevance {
   const isStrong = ctx.matchedCategories.some((category) =>
      strongPageSignalCategories.has(category),
   );
   if (!isStrong) {
      return buildNotDetected(
         ctx.criterion,
         'No page signal matched this criterion. ' +
            `Weakly matched ${formatList(ctx.signalLabels)} signals do not count on ` +
            'their own.',
      );
   }

   let tagSuffix = '.';
   if (ctx.matchedTags.length > 0) {
      tagSuffix = ` and matching criterion tags (${formatList(ctx.matchedTags)}).`;
   }

   return {
      criterionId: ctx.criterion.id,
      title: ctx.criterion.title,
      state: 'relevant',
      reasons: [
         `Detected ${formatList(ctx.signalLabels)} signals (${formatList(ctx.signalValues)})${tagSuffix}`,
      ],
      matchedSignalCategories: ctx.matchedCategories,
      matchedTags: ctx.matchedTags,
      elements: collectSignalElements(ctx.matchedSignals),
   };
}

function buildContext(criterion: NormalizedCriterion, input: PageScan): RelevanceContext {
   const { signals } = input;
   const matchedCategories = getMatchedCategories(criterion, signals);
   const matchedSignals = signals.filter((signal) =>
      matchedCategories.includes(signal.category),
   );
   return {
      criterion,
      signals,
      matchedSignals,
      matchedCategories,
      matchedTags: getMatchedTags(criterion, matchedCategories),
      signalValues: dedupe(matchedSignals.map((signal) => signal.value)).slice(
         0,
         MAX_SIGNAL_VALUES,
      ),
      signalLabels: dedupe(
         matchedCategories.map((category) => categoryReasonLabels[category]),
      ),
   };
}

function evaluateWidgetOrDefault(ctx: RelevanceContext): CriterionRelevance {
   const onlyWidgetSignals =
      ctx.signals.length > 0 &&
      ctx.signals.every((signal) => signal.category === 'widget');

   if (onlyWidgetSignals) {
      const unknownAssessment = getInteractiveUnknownAssessment(
         ctx.criterion,
         ctx.matchedTags,
         collectSignalElements(ctx.signals),
      );
      if (unknownAssessment) {
         return unknownAssessment;
      }
   }

   if (ctx.matchedCategories.length > 0) {
      return evaluateDefaultCriterion(ctx);
   }

   return buildNotDetected(ctx.criterion, 'No page signal matched this criterion.');
}

function evaluateCriterionRelevance(
   criterion: NormalizedCriterion,
   input: PageScan,
): CriterionRelevance {
   const ctx = buildContext(criterion, input);

   if (criterion.id === '3.3.8') {
      return evaluateAuthCriterion(ctx);
   }

   if (criterion.id === '4.1.3') {
      return evaluateStatusCriterion(ctx);
   }

   return evaluateWidgetOrDefault(ctx);
}

/** Explains how one criterion applies to one relevance input. */
export function getCriterionRelevance(
   lookupKey: CriterionLookupKey,
   input: PageScan,
   options?: { version?: string },
): CriterionRelevanceLookupResult {
   const version = parseVersion(options?.version);
   const parsedInput = pageScanSchema.parse(input);
   const criterion = resolveCriterion(version, lookupKey);
   const assessment = evaluateCriterionRelevance(criterion, parsedInput);

   return criterionRelevanceLookupResultSchema.parse({
      lookupKey,
      version,
      target: parsedInput.target,
      criterion,
      assessment,
   });
}

/** Computes relevance assessments for the full criterion set. */
export function listRelevantCriteria(
   input: PageScan,
   options?: { version?: string },
): RelevanceMatrix {
   const version = parseVersion(options?.version);
   const parsedInput = pageScanSchema.parse(input);
   const artifacts = getArtifacts(version);
   const relevantAssessments = Object.values(artifacts.criteria)
      .map((criterion) => evaluateCriterionRelevance(criterion, parsedInput))
      .filter(
         (assessment) =>
            assessment.state !== 'not-detected' && assessment.state !== 'out-of-scope',
      )
      .toSorted((left, right) =>
         left.criterionId.localeCompare(right.criterionId, undefined, {
            numeric: true,
         }),
      );

   return relevanceMatrixSchema.parse({
      version,
      target: parsedInput.target,
      assessments: Object.fromEntries(
         relevantAssessments.map((assessment) => [assessment.criterionId, assessment]),
      ),
   });
}
