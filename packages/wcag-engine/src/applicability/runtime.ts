import {
   applicabilityInputSchema,
   applicabilityMatrixSchema,
   criterionApplicabilityLookupResultSchema,
   type ApplicabilityInput,
   type ApplicabilityMatrix,
   type ApplicabilitySignal,
   type ApplicabilitySignalCategory,
   type CriterionApplicability,
   type CriterionApplicabilityLookupResult,
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
import { categoryReasonLabels, strongApplicabilityCategories } from '../shared/data.js';

const MAX_SIGNAL_VALUES = 4;

interface ApplicabilityContext {
   criterion: NormalizedCriterion;
   signals: ApplicabilitySignal[];
   matchedSignals: ApplicabilitySignal[];
   matchedCategories: ApplicabilitySignalCategory[];
   matchedTags: string[];
   signalValues: string[];
   signalLabels: string[];
}

function evaluateAuthCriterion(ctx: ApplicabilityContext): CriterionApplicability {
   const authSignals = ctx.signals.filter((signal) => signal.category === 'auth');
   const authTags = getMatchedTags(ctx.criterion, ['auth']);

   if (authSignals.length > 0) {
      return {
         criterionId: ctx.criterion.id,
         title: ctx.criterion.title,
         state: 'applicable',
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
   ctx: ApplicabilityContext,
): CriterionApplicability | undefined {
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
      state: 'applicable',
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

function evaluateStatusCriterion(ctx: ApplicabilityContext): CriterionApplicability {
   const result = evaluateStatusWithLiveRegion(ctx);
   if (result) {
      return result;
   }

   return buildNotDetected(
      ctx.criterion,
      'No live region or equivalent status signal was detected for this target.',
   );
}

function evaluateDefaultCriterion(ctx: ApplicabilityContext): CriterionApplicability {
   const isStrong = ctx.matchedCategories.some((category) =>
      strongApplicabilityCategories.has(category),
   );
   if (!isStrong) {
      return buildNotDetected(
         ctx.criterion,
         'No signal-backed applicability match was detected for this criterion. ' +
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
      state: 'applicable',
      reasons: [
         `Detected ${formatList(ctx.signalLabels)} signals (${formatList(ctx.signalValues)})${tagSuffix}`,
      ],
      matchedSignalCategories: ctx.matchedCategories,
      matchedTags: ctx.matchedTags,
      elements: collectSignalElements(ctx.matchedSignals),
   };
}

function buildContext(
   criterion: NormalizedCriterion,
   input: ApplicabilityInput,
): ApplicabilityContext {
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

function evaluateWidgetOrDefault(ctx: ApplicabilityContext): CriterionApplicability {
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

   return buildNotDetected(
      ctx.criterion,
      'No matching applicability signals were detected for this criterion.',
   );
}

function evaluateCriterionApplicability(
   criterion: NormalizedCriterion,
   input: ApplicabilityInput,
): CriterionApplicability {
   const ctx = buildContext(criterion, input);

   if (criterion.id === '3.3.8') {
      return evaluateAuthCriterion(ctx);
   }

   if (criterion.id === '4.1.3') {
      return evaluateStatusCriterion(ctx);
   }

   return evaluateWidgetOrDefault(ctx);
}

/** Explains how one criterion applies to one applicability input. */
export function getCriterionApplicability(
   lookupKey: CriterionLookupKey,
   input: ApplicabilityInput,
   options?: { version?: string },
): CriterionApplicabilityLookupResult {
   const version = parseVersion(options?.version);
   const parsedInput = applicabilityInputSchema.parse(input);
   const criterion = resolveCriterion(version, lookupKey);
   const assessment = evaluateCriterionApplicability(criterion, parsedInput);

   return criterionApplicabilityLookupResultSchema.parse({
      lookupKey,
      version,
      target: parsedInput.target,
      criterion,
      assessment,
   });
}

/** Computes applicability assessments for the full criterion set. */
export function listApplicableCriteria(
   input: ApplicabilityInput,
   options?: { version?: string },
): ApplicabilityMatrix {
   const version = parseVersion(options?.version);
   const parsedInput = applicabilityInputSchema.parse(input);
   const artifacts = getArtifacts(version);
   const relevantAssessments = Object.values(artifacts.criteria)
      .map((criterion) => evaluateCriterionApplicability(criterion, parsedInput))
      .filter(
         (assessment) =>
            assessment.state !== 'not-detected' && assessment.state !== 'out-of-scope',
      )
      .toSorted((left, right) =>
         left.criterionId.localeCompare(right.criterionId, undefined, {
            numeric: true,
         }),
      );

   return applicabilityMatrixSchema.parse({
      version,
      target: parsedInput.target,
      assessments: Object.fromEntries(
         relevantAssessments.map((assessment) => [assessment.criterionId, assessment]),
      ),
   });
}
