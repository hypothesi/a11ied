/* oxlint-disable max-lines, max-lines-per-function, max-statements, complexity/complexity, no-magic-numbers */
import {
   verdictSchema,
   type CriterionId,
   type EvaluationTier,
   type MeasurementRecord,
   type ObservationBundle,
   type ObservationRef,
   type ScopeExclusionRule,
   type Verdict,
   type VerdictImpact,
   type VerdictMethod,
   type VerdictNextAction,
   type VerdictOutcome,
} from '@a11ied/contracts';

import { WCAG_22_AA_CRITERIA } from './criteria.js';
export { WCAG_22_AA_CRITERIA } from './criteria.js';
import { computeVerdictId } from './store.js';
import { getObservationDigest } from '@a11ied/observe';
import { matchScopeExclusion } from './template-dedupe.js';

function bindEvidenceSnapshot(bundle: ObservationBundle, verdict: Verdict): Verdict {
   const digest = getObservationDigest(bundle);
   for (const ref of verdict.evidence) {
      ref.digest = digest;
   }
   return verdictSchema.parse(verdict);
}

export interface ScoreOptions {
   exclusions?: readonly ScopeExclusionRule[];
   siteFacts?: {
      hasSitemap?: boolean;
      navSignatures?: readonly string[];
      helpSignatures?: readonly string[];
   };
}

interface AxeNode {
   html?: string;
   target?: string[];
   failureSummary?: string;
}

interface AxeViolation {
   id?: string;
   impact?: VerdictImpact;
   tags?: string[];
   description?: string;
   help?: string;
   helpUrl?: string;
   nodes?: AxeNode[];
}

const IMPACT_ORDER: readonly VerdictImpact[] = [
   'critical',
   'serious',
   'moderate',
   'minor',
];

const BCP47_LANGUAGE_TAG = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/;
const GENERIC_LINK_TEXT = /^(click here|here|read more|more|learn more|link|this)$/i;
const SENSORY_INSTRUCTION =
   /\b(click|press|tap|see|use)\s+(?:the\s+)?(red|green|blue|round|square|left|right|top|bottom|above|below)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getFacts(bundle: ObservationBundle): Record<string, unknown> {
   return isRecord(bundle.facts) ? bundle.facts : {};
}

function asArray<ItemType>(value: unknown): ItemType[] {
   return Array.isArray(value) ? (value as ItemType[]) : [];
}

function findAxeViolationsForCriterion(
   axeData: Record<string, unknown> | undefined,
   criterionId: CriterionId,
): AxeViolation[] {
   if (!axeData || !Array.isArray(axeData.violations)) {
      return [];
   }
   const tag = `wcag${criterionId.replaceAll('.', '')}`.toLowerCase();
   return (axeData.violations as AxeViolation[]).filter((violation) => {
      if (!violation || !Array.isArray(violation.tags)) {
         return false;
      }
      return violation.tags.some(
         (tagItem) => typeof tagItem === 'string' && tagItem.toLowerCase() === tag,
      );
   });
}

function mapAxeImpact(violations: readonly AxeViolation[]): VerdictImpact {
   let highest: VerdictImpact = 'serious';
   for (const violation of violations) {
      const impact = violation.impact;
      if (
         impact &&
         IMPACT_ORDER.includes(impact) &&
         IMPACT_ORDER.indexOf(impact) < IMPACT_ORDER.indexOf(highest)
      ) {
         highest = impact;
      }
   }
   return highest;
}

function getContrastThreshold(
   isNonText: boolean,
   isLargeText: boolean | undefined,
): number {
   if (isNonText || isLargeText) {
      return 3;
   }
   return 4.5;
}

function collectContrastMeasurements(
   bundle: ObservationBundle,
   criterionId: '1.4.3' | '1.4.11',
): MeasurementRecord[] {
   const records: MeasurementRecord[] = [];
   const isNonText = criterionId === '1.4.11';
   const candidateSamples = bundle.contrast.filter((sample) =>
      isNonText ? sample.isUiComponent : !sample.isUiComponent,
   );
   const effectiveSamples =
      candidateSamples.length > 0 ? candidateSamples : bundle.contrast;

   for (const sample of effectiveSamples) {
      const threshold = getContrastThreshold(isNonText, sample.isLargeText);
      for (const stateSample of sample.samples) {
         const effectiveRatio =
            stateSample.minTransitionContrastRatio === undefined
               ? stateSample.contrastRatio
               : Math.min(
                    stateSample.contrastRatio,
                    stateSample.minTransitionContrastRatio,
                 );

         records.push({
            metric: `${sample.tag}:${stateSample.state}:contrastRatio`,
            value: stateSample.contrastRatio,
            threshold,
            unit: 'contrastRatio',
            target: sample.selector,
            pass: effectiveRatio >= threshold,
         });

         if (stateSample.minTransitionContrastRatio !== undefined) {
            records.push({
               metric: `${sample.tag}:${stateSample.state}:minTransitionContrastRatio`,
               value: stateSample.minTransitionContrastRatio,
               threshold,
               unit: 'contrastRatio',
               target: sample.selector,
               pass: stateSample.minTransitionContrastRatio >= threshold,
            });
         }
      }
   }
   return records;
}

function collectAnimationMeasurements(
   bundle: ObservationBundle,
   criterionId: '2.2.2' | '2.3.1',
): MeasurementRecord[] {
   const facts = getFacts(bundle);
   const animations = asArray<{
      name?: string;
      dur?: number | null;
      iter?: number | null;
   }>(facts.runningAnimations);
   const records: MeasurementRecord[] = [];

   if (criterionId === '2.2.2') {
      if (animations.length === 0) {
         records.push({
            metric: 'runningAnimations.maxDuration',
            value: 0,
            threshold: 5000,
            unit: 'ms',
            pass: true,
         });
      } else {
         for (const anim of animations) {
            const dur = anim.dur ?? 0;
            records.push({
               metric: `animation:${anim.name || 'unnamed'}:duration`,
               value: dur,
               threshold: 5000,
               unit: 'ms',
               target: anim.name,
               pass: dur <= 5000 && anim.iter !== null,
            });
         }
      }
   } else if (animations.length === 0) {
      records.push({
         metric: 'runningAnimations.flashFrequency',
         value: 0,
         threshold: 3,
         unit: 'Hz',
         pass: true,
      });
   } else {
      for (const anim of animations) {
         const dur = anim.dur;
         const freq =
            dur !== undefined && dur !== null && dur > 0
               ? Number((1000 / dur).toFixed(2))
               : 0;
         const isLooping = anim.iter === null;
         records.push({
            metric: `animation:${anim.name || 'unnamed'}:flashFrequency`,
            value: freq,
            threshold: 3,
            unit: 'Hz',
            target: anim.name,
            pass: !(dur !== null && dur !== undefined && dur < 333 && isLooping),
         });
      }
   }
   return records;
}

function collectSmallTargetMeasurements(bundle: ObservationBundle): MeasurementRecord[] {
   const facts = getFacts(bundle);
   const smallTargets = asArray<{
      html?: string;
      width: number;
      height: number;
      crowded: boolean;
   }>(facts.smallTargets);

   if (smallTargets.length === 0) {
      return [
         {
            metric: 'target.width',
            value: 24,
            threshold: 24,
            unit: 'px',
            pass: true,
         },
         {
            metric: 'target.height',
            value: 24,
            threshold: 24,
            unit: 'px',
            pass: true,
         },
      ];
   }

   const records: MeasurementRecord[] = [];
   for (const target of smallTargets) {
      records.push({
         metric: 'target.width',
         value: target.width,
         threshold: 24,
         unit: 'px',
         target: target.html ? target.html.slice(0, 60) : undefined,
         pass: target.width >= 24 || !target.crowded,
      });
      records.push({
         metric: 'target.height',
         value: target.height,
         threshold: 24,
         unit: 'px',
         target: target.html ? target.html.slice(0, 60) : undefined,
         pass: target.height >= 24 || !target.crowded,
      });
   }
   return records;
}

function collectFocusMeasurements(
   bundle: ObservationBundle,
   criterionId: '2.4.7' | '2.4.11',
): MeasurementRecord[] {
   const facts = getFacts(bundle);
   const tabStops = asArray<{
      id?: string;
      obscured?: boolean;
      inView?: boolean;
   } | null>(facts.tabStops).filter(
      (stopItem): stopItem is NonNullable<typeof stopItem> => stopItem !== null,
   );

   if (criterionId === '2.4.11') {
      const obscuredCount = tabStops.filter(
         (stopItem) => stopItem.obscured && stopItem.inView,
      ).length;
      return [
         {
            metric: 'obscuredFocusStops.count',
            value: obscuredCount,
            threshold: 0,
            unit: 'count',
            pass: obscuredCount === 0,
         },
      ];
   }

   const records: MeasurementRecord[] = [];
   const noIndicator = asArray<string>(facts.noIndicator);
   records.push({
      metric: 'noIndicator.count',
      value: noIndicator.length,
      threshold: 0,
      unit: 'count',
      pass: noIndicator.length === 0,
   });

   for (const sample of bundle.contrast) {
      for (const stateSample of sample.samples) {
         if (stateSample.state === 'focus-visible') {
            records.push({
               metric: `${sample.tag}:focus-visible:contrastRatio`,
               value: stateSample.contrastRatio,
               threshold: 3,
               unit: 'contrastRatio',
               target: sample.selector,
               pass: stateSample.contrastRatio >= 3,
            });
         }
      }
   }
   return records;
}

export function collectMeasurements(
   bundle: ObservationBundle,
   criterionId: CriterionId,
): MeasurementRecord[] | undefined {
   switch (criterionId) {
      case '1.3.4': {
         return [
            {
               metric: 'portrait.overflowPx',
               value: bundle.viewports.portrait.overflowPx,
               threshold: 0,
               unit: 'px',
               pass: bundle.viewports.portrait.overflowPx <= 0,
            },
         ];
      }
      case '1.4.3':
      case '1.4.11': {
         const contrastRecords = collectContrastMeasurements(bundle, criterionId);
         return contrastRecords.length > 0 ? contrastRecords : undefined;
      }
      case '1.4.4': {
         if (
            !bundle.textResize ||
            bundle.textResize.verifiedCount === 0 ||
            bundle.textResize.unverifiedCount > 0
         ) {
            return undefined;
         }
         return [
            {
               metric: 'textResize.factor',
               value: bundle.textResize.factor,
               unit: 'ratio',
               threshold: 2,
               pass: bundle.textResize.factor >= 2,
            },
         ];
      }
      case '1.4.10': {
         return [
            {
               metric: 'reflow320.overflowPx',
               value: bundle.viewports.reflow320.overflowPx,
               threshold: 0,
               unit: 'px',
               pass: bundle.viewports.reflow320.overflowPx <= 0,
            },
         ];
      }
      case '1.4.12': {
         return [
            {
               metric: 'textSpacingClipped.length',
               value: bundle.viewports.textSpacingClipped.length,
               threshold: 0,
               unit: 'count',
               pass: bundle.viewports.textSpacingClipped.length === 0,
            },
         ];
      }
      case '2.2.2':
      case '2.3.1': {
         return collectAnimationMeasurements(bundle, criterionId);
      }
      case '2.4.7':
      case '2.4.11': {
         return collectFocusMeasurements(bundle, criterionId);
      }
      case '2.5.8': {
         return collectSmallTargetMeasurements(bundle);
      }
      default: {
         return undefined;
      }
   }
}

interface EvaluationResult {
   tier: EvaluationTier;
   outcome: VerdictOutcome;
   confidence: number;
   method: VerdictMethod;
   rationale: string;
   impact?: VerdictImpact | undefined;
   evidence?: ObservationRef[] | undefined;
   measurements?: MeasurementRecord[] | undefined;
   nextAction?: VerdictNextAction | undefined;
}

function evaluateContrastCriterion(
   bundle: ObservationBundle,
   criterionId: '1.4.3' | '1.4.11',
): EvaluationResult {
   const measurements = collectContrastMeasurements(bundle, criterionId);
   const failingMeasurement = measurements.find((meas) => meas.pass === false);

   if (failingMeasurement) {
      return {
         tier: 1,
         outcome: 'failed',
         confidence: 0.9,
         method: 'programmatic-probe',
         impact: 'serious',
         rationale: `Contrast ratio fell below threshold (${String(failingMeasurement.value)} < ${String(failingMeasurement.threshold)}:1) on ${failingMeasurement.target ?? 'element'}.`,
         evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#contrast' }],
         measurements,
      };
   }

   const axeIncomplete = asArray<{ id?: string }>(bundle.axe?.incomplete);
   const hasAxeContrastIncomplete = axeIncomplete.some(
      (incompleteItem) => incompleteItem.id === 'color-contrast',
   );
   const facts = getFacts(bundle);
   const images = asArray(facts.images);
   const svgImgs = asArray(facts.svgImgs);
   const hasImagesOrGradients = images.length > 0 || svgImgs.length > 0;

   if (measurements.length === 0 || hasAxeContrastIncomplete || hasImagesOrGradients) {
      return {
         tier: 2,
         outcome: 'needsReview',
         confidence: 0.75,
         method: 'programmatic-probe',
         rationale:
            'Missing contrast samples or unresolved backgrounds and states require visual review.',
         evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#contrast' }],
         measurements: measurements.length > 0 ? measurements : undefined,
         nextAction: {
            kind: 'review-visual',
            summary: 'Verify contrast over background gradients, images, or transitions.',
         },
      };
   }

   return {
      tier: 1,
      outcome: 'passed',
      confidence: 0.9,
      method: 'programmatic-probe',
      rationale: `All measured contrast samples meet or exceed minimum threshold (${criterionId === '1.4.11' ? '3.0:1' : '4.5:1 / 3.0:1'}).`,
      evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#contrast' }],
      measurements: measurements.length > 0 ? measurements : undefined,
   };
}

function evaluateCriterionPure(
   bundle: ObservationBundle,
   criterionId: CriterionId,
   options?: ScoreOptions,
): EvaluationResult {
   const facts = getFacts(bundle);
   const siteFacts = options?.siteFacts;

   switch (criterionId) {
      case '1.1.1': {
         const images = asArray<{ alt?: string | null; src?: string }>(facts.images);
         const svgImgs = asArray<{ hidden?: boolean; label?: string | null }>(
            facts.svgImgs,
         );
         const unnamedButtons = asArray<string>(facts.unnamedButtons);
         const unnamedImages = asArray<string>(facts.unnamedImages);
         const media = isRecord(facts.media) ? facts.media : {};
         const mediaEmbeds = asArray<string>(media.embeds);

         const missingAlt =
            unnamedImages.length > 0 ||
            images.some(
               (img) => img.alt === null || img.alt === undefined || img.alt === '',
            ) ||
            svgImgs.some((svg) => !svg.hidden && !svg.label);

         if (unnamedButtons.length > 0 || missingAlt) {
            return {
               tier: 0,
               outcome: 'failed',
               confidence: 1,
               method: 'dom-facts',
               impact: 'serious',
               rationale:
                  'Images or icon-only controls lack an accessible text alternative.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         if (images.length === 0 && svgImgs.length === 0 && mediaEmbeds.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No images, SVGs, or media embeds observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale: `${String(images.length + svgImgs.length)} non-text element(s) carry text alternatives; visual review required to verify accuracy in context.`,
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'review-visual',
               summary:
                  'Verify image alt text accurately conveys equivalent purpose in context.',
            },
         };
      }

      case '1.2.1':
      case '1.2.2':
      case '1.2.3':
      case '1.2.4':
      case '1.2.5': {
         const media = isRecord(facts.media) ? facts.media : {};
         const instrumented = isRecord(facts.instrumented) ? facts.instrumented : {};
         const totalMedia =
            (typeof media.video === 'number' ? media.video : 0) +
            (typeof media.audio === 'number' ? media.audio : 0) +
            asArray(media.embeds).length +
            (typeof instrumented.mediaPlays === 'number' ? instrumented.mediaPlays : 0) +
            (typeof instrumented.audioContexts === 'number'
               ? instrumented.audioContexts
               : 0);

         if (totalMedia === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No media elements or playback contexts observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.8,
            method: 'dom-facts',
            rationale:
               'Observed media requires manual verification of alternatives, captions, or descriptions.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary: `Verify media alternatives and captions for WCAG ${criterionId}.`,
            },
         };
      }

      case '1.3.1': {
         const controls = asArray<{ label?: string; type?: string }>(facts.controls);
         const unlabeledControls = controls.filter(
            (ctrl) =>
               !ctrl.label && !['submit', 'button', 'hidden'].includes(ctrl.type ?? ''),
         );
         const headings = asArray<{ level?: number }>(facts.headings);
         const landmarks = isRecord(facts.landmarks) ? facts.landmarks : {};
         const mainCount = typeof landmarks.main === 'number' ? landmarks.main : 0;

         if (unlabeledControls.length > 0 || (headings.length > 1 && mainCount === 0)) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.85,
               method: 'dom-facts',
               impact: 'moderate',
               rationale: `Structure issues observed: ${unlabeledControls.length} unlabeled control(s) and ${mainCount} main landmark(s).`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Verify visual headings, lists, and tables match programmatic structure.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'inspect-element',
               summary:
                  'Verify visual headings, lists, and tables match programmatic structure.',
            },
         };
      }

      case '1.3.2': {
         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale: 'Verify DOM order matches the meaningful visual reading sequence.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Verify reading order and DOM sequence match meaningful visual presentation.',
            },
         };
      }

      case '1.3.3': {
         const bodyText = typeof facts.bodyText === 'string' ? facts.bodyText : '';
         if (SENSORY_INSTRUCTION.test(bodyText)) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.75,
               method: 'dom-facts',
               rationale:
                  'Instruction text mentions color, shape, or position; verify understanding does not depend solely on sensory characteristics.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               nextAction: {
                  kind: 'review-visual',
                  summary:
                     'Verify instructions do not rely solely on shape, color, size, or visual orientation.',
               },
            };
         }

         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.85,
            method: 'dom-facts',
            rationale:
               'No instructions relying solely on shape, color, size, or visual orientation were observed.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '1.3.4': {
         const overflow = bundle.viewports.portrait.overflowPx;
         const measurements = collectMeasurements(bundle, '1.3.4');
         if (overflow > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'programmatic-probe',
               impact: 'moderate',
               rationale: `Portrait orientation overflows horizontally by ${String(overflow)}px.`,
               evidence: [
                  { fingerprint: bundle.fingerprint, path: 'bundle.json#viewports' },
               ],
               measurements,
            };
         }
         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'programmatic-probe',
            rationale:
               'Content fits within viewport with 0px horizontal overflow across orientations.',
            evidence: [
               { fingerprint: bundle.fingerprint, path: 'bundle.json#viewports' },
            ],
            measurements,
         };
      }

      case '1.3.5': {
         const controls = asArray<{
            name?: string;
            type?: string;
            autocomplete?: string | null;
         }>(facts.controls);
         if (controls.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No form controls observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         const missingAutocomplete = controls.filter(
            (ctrl) =>
               /name|email|phone|tel|address/i.test(
                  `${ctrl.name ?? ''}${ctrl.type ?? ''}`,
               ) && !ctrl.autocomplete,
         );

         if (missingAutocomplete.length > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'dom-facts',
               impact: 'moderate',
               rationale: `${String(missingAutocomplete.length)} personal-data field(s) lack autocomplete attributes.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'dom-facts',
            rationale:
               'All observed personal data input fields declare valid autocomplete tokens.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '1.4.1': {
         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.7,
            method: 'dom-facts',
            rationale:
               'Color reliance requires visual inspection to verify non-color cues exist.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'review-visual',
               summary:
                  'Verify color is not the only visual means of conveying information or distinguishing links.',
            },
         };
      }

      case '1.4.2': {
         const media = isRecord(facts.media) ? facts.media : {};
         const autoplay = typeof media.autoplay === 'number' ? media.autoplay : 0;
         const hasMediaArtifacts =
            (typeof media.video === 'number' ? media.video : 0) +
               (typeof media.audio === 'number' ? media.audio : 0) +
               asArray(media.embeds).length >
            0;

         if (autoplay === 0 && !hasMediaArtifacts) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale:
                  'No autoplaying audio or media playback contexts observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Autoplaying media or audio playback requires verification of pause and volume controls.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Verify audio playing for more than 3 seconds has pause, stop, or volume control.',
            },
         };
      }

      case '1.4.3': {
         return evaluateContrastCriterion(bundle, '1.4.3');
      }

      case '1.4.4': {
         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'programmatic-probe',
            rationale:
               'The 640px viewport observation does not establish text enlargement or preservation of content and functionality.',
            evidence: [
               { fingerprint: bundle.fingerprint, path: 'bundle.json#viewports' },
            ],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Apply and verify text enlargement up to 200%, then assess content and functionality.',
            },
         };
      }

      case '1.4.5': {
         const images = asArray(facts.images);
         const svgImgs = asArray(facts.svgImgs);
         if (images.length === 0 && svgImgs.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No raster images or SVGs observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }
         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale: `Page contains ${String(images.length)} image(s) and ${String(svgImgs.length)} SVG(s); visual review needed to verify text is not rendered as raster images.`,
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'review-visual',
               summary:
                  'Verify images of text are not used where actual text can achieve the same visual presentation.',
            },
         };
      }

      case '1.4.10': {
         const overflow = bundle.viewports.reflow320.overflowPx;
         const measurements = collectMeasurements(bundle, '1.4.10');
         if (overflow > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'programmatic-probe',
               impact: 'serious',
               rationale: `At 320px viewport width the layout scrolls horizontally by ${String(overflow)}px.`,
               evidence: [
                  { fingerprint: bundle.fingerprint, path: 'bundle.json#viewports' },
               ],
               measurements,
            };
         }
         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'programmatic-probe',
            rationale:
               'Content reflows cleanly at 320px viewport width without horizontal scroll (0px overflow).',
            evidence: [
               { fingerprint: bundle.fingerprint, path: 'bundle.json#viewports' },
            ],
            measurements,
         };
      }

      case '1.4.11': {
         return evaluateContrastCriterion(bundle, '1.4.11');
      }

      case '1.4.12': {
         const clipped = bundle.viewports.textSpacingClipped;
         const measurements = collectMeasurements(bundle, '1.4.12');
         if (clipped.length > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'programmatic-probe',
               impact: 'serious',
               rationale: `${String(clipped.length)} element(s) clip text when WCAG text spacing overrides are applied.`,
               evidence: [
                  { fingerprint: bundle.fingerprint, path: 'bundle.json#viewports' },
               ],
               measurements,
            };
         }
         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'programmatic-probe',
            rationale:
               'No text clipping observed when WCAG text spacing overrides are applied.',
            evidence: [
               { fingerprint: bundle.fingerprint, path: 'bundle.json#viewports' },
            ],
            measurements,
         };
      }

      case '1.4.13': {
         const interactiveCount =
            typeof facts.interactiveCount === 'number' ? facts.interactiveCount : 0;
         if (interactiveCount === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No interactive elements observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }
         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Verify hover and focus triggered content is dismissible, hoverable, and persistent.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'review-visual',
               summary:
                  'Verify hover and focus triggered content is dismissible, hoverable, and persistent.',
            },
         };
      }

      case '2.1.1': {
         const clickOnNonInteractive = asArray<string>(facts.clickOnNonInteractive);
         if (clickOnNonInteractive.length > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'dom-facts',
               impact: 'serious',
               rationale: `Click event handlers detected on non-interactive elements: ${clickOnNonInteractive.slice(0, 3).join(' | ')}.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         const interactiveCount =
            typeof facts.interactiveCount === 'number'
               ? facts.interactiveCount
               : asArray(facts.controls).length + asArray(facts.links).length;

         if (interactiveCount > 0) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.8,
               method: 'dom-facts',
               rationale: `${String(interactiveCount)} interactive control(s) present; keyboard operability requires interactive verification.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               nextAction: {
                  kind: 'run-procedure',
                  summary:
                     'Verify custom interactive controls can be operated completely by keyboard.',
               },
            };
         }

         return {
            tier: 0,
            outcome: 'inapplicable',
            confidence: 1,
            method: 'dom-facts',
            rationale: 'No interactive controls observed on page.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '2.1.2': {
         const tabStops = asArray(facts.tabStops);
         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale: `The tab walk recorded ${String(tabStops.length)} samples. This does not establish whether components can be exited using keyboard controls.`,
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Enter relevant components and verify keyboard exit methods, including documented nonstandard methods.',
            },
         };
      }

      case '2.1.4': {
         const listeners = isRecord(facts.listeners) ? facts.listeners : {};
         const keyListeners = [
            ...asArray<string>(listeners.window),
            ...asArray<string>(listeners.document),
            ...asArray<string>(listeners.body),
         ].filter((keyEvent) => keyEvent === 'keydown' || keyEvent === 'keypress');

         if (keyListeners.length > 0) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.75,
               method: 'dom-facts',
               rationale:
                  'Document-level key handlers registered; verify single-character shortcuts can be disabled or remapped.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               nextAction: {
                  kind: 'run-procedure',
                  summary:
                     'Verify whether custom keyboard shortcuts can be turned off, remapped, or active only on focus.',
               },
            };
         }

         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'dom-facts',
            rationale: 'No document-level key handlers detected.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '2.2.1': {
         if (facts.metaRefresh === true) {
            return {
               tier: 0,
               outcome: 'failed',
               confidence: 1,
               method: 'dom-facts',
               impact: 'serious',
               rationale:
                  'Page specifies automatic redirection or refresh via meta refresh without user control.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 0,
            outcome: 'inapplicable',
            confidence: 1,
            method: 'dom-facts',
            rationale: 'No meta refresh, session timeout, or timed content was observed.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '2.2.2': {
         const measurements = collectMeasurements(bundle, '2.2.2');
         const animations = asArray<{
            name?: string;
            dur?: number | null;
            iter?: number | null;
         }>(facts.runningAnimations);
         const infiniteOrLong = animations.filter(
            (anim) =>
               anim.iter === null ||
               (anim.dur !== null && anim.dur !== undefined && anim.dur > 5000),
         );

         if (infiniteOrLong.length > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'programmatic-probe',
               impact: 'moderate',
               rationale: `${String(infiniteOrLong.length)} CSS animation(s) run continuously or exceed 5s without pause controls.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               measurements,
            };
         }

         const marquee = typeof facts.marquee === 'number' ? facts.marquee : 0;
         if (animations.length === 0 && marquee === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'programmatic-probe',
               rationale: 'No running animations or marquees observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               measurements,
            };
         }

         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'programmatic-probe',
            rationale: 'All observed animations terminate within 5 seconds.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            measurements,
         };
      }

      case '2.3.1': {
         const measurements = collectMeasurements(bundle, '2.3.1');
         const animations = asArray<{ dur?: number | null; iter?: number | null }>(
            facts.runningAnimations,
         );
         const fastLooping = animations.some(
            (anim) =>
               anim.dur !== null &&
               anim.dur !== undefined &&
               anim.dur < 333 &&
               anim.iter === null,
         );

         if (fastLooping) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.75,
               method: 'programmatic-probe',
               impact: 'critical',
               rationale:
                  'Looping animation cycles faster than 333ms (exceeding 3 flashes per second threshold).',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               measurements,
               nextAction: {
                  kind: 'review-visual',
                  summary:
                     'Verify whether looping animation cycling faster than 3Hz exceeds flash area thresholds.',
               },
            };
         }

         if (animations.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'programmatic-probe',
               rationale: 'No flashing or moving animations observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               measurements,
            };
         }

         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'programmatic-probe',
            rationale: 'No animation cycles faster than 3 times per second.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            measurements,
         };
      }

      case '2.4.1': {
         if (facts.skipLink) {
            return {
               tier: 1,
               outcome: 'passed',
               confidence: 0.9,
               method: 'dom-facts',
               rationale: `Skip link ("${String(facts.skipLink)}") provides a direct mechanism to bypass repeated blocks.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         const landmarks = isRecord(facts.landmarks) ? facts.landmarks : {};
         const mainCount = typeof landmarks.main === 'number' ? landmarks.main : 0;
         const headings = asArray(facts.headings);

         if (mainCount > 0 && headings.length > 0) {
            return {
               tier: 1,
               outcome: 'passed',
               confidence: 0.85,
               method: 'dom-facts',
               rationale:
                  'Main landmark and headings allow assistive technology users to bypass repeated navigation blocks.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 1,
            outcome: 'failed',
            confidence: 0.85,
            method: 'dom-facts',
            impact: 'moderate',
            rationale:
               'No skip link and no main landmark found to bypass repeated content blocks.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '2.4.2': {
         const title = typeof facts.title === 'string' ? facts.title.trim() : '';
         if (title.length > 0) {
            return {
               tier: 0,
               outcome: 'passed',
               confidence: 1,
               method: 'dom-facts',
               rationale: `Page declares title: "${title}".`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 0,
            outcome: 'failed',
            confidence: 1,
            method: 'dom-facts',
            impact: 'serious',
            rationale: 'Page has an empty or missing <title> element.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '2.4.3': {
         const tabStops = asArray(facts.tabStops);
         if (tabStops.length <= 1) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'Page has one or fewer tab stops.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Verify keyboard navigation order is logical and preserves meaning.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Verify keyboard navigation order is logical and preserves meaning.',
            },
         };
      }

      case '2.4.4': {
         const links = asArray<{ name?: string; href?: string | null }>(facts.links);
         if (links.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No links observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         const vague = links.filter(
            (link) => !link.name || GENERIC_LINK_TEXT.test(link.name.trim()),
         );

         if (vague.length > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.85,
               method: 'dom-facts',
               impact: 'moderate',
               rationale: `${String(vague.length)} link(s) use generic accessible names without sufficient context.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Verify link text and surrounding context clearly describe target destination.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'inspect-element',
               summary:
                  'Verify link text and surrounding context clearly describe target purpose.',
            },
         };
      }

      case '2.4.5': {
         if (siteFacts?.hasSitemap === true) {
            return {
               tier: 1,
               outcome: 'passed',
               confidence: 0.85,
               method: 'dom-facts',
               rationale:
                  'Sitemap and site navigation provide multiple ways to locate pages.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Multi-page locator verification required (search, navigation, sitemap).',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Verify at least two ways exist to locate a web page within a set of pages.',
            },
         };
      }

      case '2.4.6': {
         const headings = asArray<{ text?: string }>(facts.headings);
         const emptyHeadings = headings.filter(
            (heading) => !heading.text || heading.text.trim() === '',
         );
         if (emptyHeadings.length > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.85,
               method: 'dom-facts',
               impact: 'moderate',
               rationale: `${String(emptyHeadings.length)} heading(s) are empty.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         const controls = asArray(facts.controls);
         if (headings.length === 0 && controls.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No headings or input controls observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale: 'Verify headings and labels describe topic or purpose.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'inspect-element',
               summary: 'Verify headings and labels describe topic or purpose.',
            },
         };
      }

      case '2.4.7': {
         const measurements = collectMeasurements(bundle, '2.4.7');
         const noIndicator = asArray<string>(facts.noIndicator);
         if (noIndicator.length > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'programmatic-probe',
               impact: 'serious',
               rationale: `${String(noIndicator.length)} tab stop(s) show no visible focus indicator.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               measurements,
            };
         }

         const tabStops = asArray(facts.tabStops);
         if (tabStops.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'programmatic-probe',
               rationale: 'No tab stops observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               measurements,
            };
         }

         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'programmatic-probe',
            rationale: 'All observed tab stops provide visible focus indicators.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            measurements,
         };
      }

      case '2.4.11': {
         const measurements = collectMeasurements(bundle, '2.4.11');
         const tabStops = asArray<{ obscured?: boolean; inView?: boolean } | null>(
            facts.tabStops,
         ).filter(
            (stopItem): stopItem is NonNullable<typeof stopItem> => stopItem !== null,
         );
         const covered = tabStops.filter(
            (stopItem) => stopItem.obscured && stopItem.inView,
         );

         if (covered.length > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'programmatic-probe',
               impact: 'serious',
               rationale: `${String(covered.length)} focused control(s) are obscured by other content.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               measurements,
            };
         }

         if (tabStops.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'programmatic-probe',
               rationale: 'No tab stops observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               measurements,
            };
         }

         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'programmatic-probe',
            rationale:
               'Every visible focused element is unobscured by sticky or overlapping content.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            measurements,
         };
      }

      case '2.5.1': {
         const sliders = asArray<string>(facts.sliders);
         if (sliders.length > 0 || bundle.heuristics.hasMultipointGesture) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.75,
               method: 'dom-facts',
               rationale:
                  'Multipoint or path-based gesture widgets observed; verify single-pointer alternative exists.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               nextAction: {
                  kind: 'run-procedure',
                  summary:
                     'Verify multipoint or path-based gestures can be operated with a single pointer.',
               },
            };
         }

         return {
            tier: 0,
            outcome: 'inapplicable',
            confidence: 1,
            method: 'dom-facts',
            rationale:
               'No multipoint or path-based gesture interactions observed on page.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '2.5.2': {
         const downHandlers = asArray<{ html?: string }>(facts.downHandlers);
         if (downHandlers.length > 0) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.75,
               method: 'dom-facts',
               rationale:
                  'Down-event handlers registered; verify activation fires on up-event or cancellation is available.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               nextAction: {
                  kind: 'run-procedure',
                  summary:
                     'Verify pointer activation fires on up-event or provides cancellation.',
               },
            };
         }

         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'dom-facts',
            rationale:
               'No mousedown, pointerdown, or touchstart activation handlers observed.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '2.5.3': {
         const links = asArray<{ text?: string; name?: string }>(facts.links);
         const mismatched = links.filter(
            (link) =>
               link.text &&
               link.name &&
               !link.name.toLowerCase().includes(link.text.toLowerCase().slice(0, 20)),
         );

         if (mismatched.length > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'dom-facts',
               impact: 'moderate',
               rationale: `${String(mismatched.length)} control(s) have an accessible name omitting their visible label text.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         const controls = asArray(facts.controls);
         if (links.length === 0 && controls.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No labelled interactive controls or links observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Verify accessible names include visible label text for all interactive elements.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'inspect-element',
               summary: 'Verify accessible name contains the visible text label.',
            },
         };
      }

      case '2.5.4': {
         const instrumented = isRecord(facts.instrumented) ? facts.instrumented : {};
         const motionListeners = asArray<string>(instrumented.motionListeners);
         if (motionListeners.length > 0) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.75,
               method: 'dom-facts',
               rationale:
                  'Device motion listeners registered; verify actuation can be disabled and alternative controls exist.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               nextAction: {
                  kind: 'run-procedure',
                  summary:
                     'Verify device motion actuation can be disabled and alternative user interface controls exist.',
               },
            };
         }

         return {
            tier: 0,
            outcome: 'inapplicable',
            confidence: 1,
            method: 'dom-facts',
            rationale: 'No device motion or orientation listeners observed.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '2.5.7': {
         const sliders = asArray<string>(facts.sliders);
         if (bundle.heuristics.hasDraggable || sliders.length > 0) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.75,
               method: 'dom-facts',
               rationale:
                  'Draggable widgets detected; verify single-pointer alternative exists.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               nextAction: {
                  kind: 'run-procedure',
                  summary:
                     'Verify dragging movements have a single pointer alternative unless dragging is essential.',
               },
            };
         }

         return {
            tier: 0,
            outcome: 'inapplicable',
            confidence: 1,
            method: 'dom-facts',
            rationale: 'No draggable interactions observed on page.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '2.5.8': {
         const measurements = collectMeasurements(bundle, '2.5.8');
         const smallTargets = asArray<{ crowded?: boolean }>(facts.smallTargets);
         const crowded = smallTargets.filter((targetItem) => targetItem.crowded);

         if (crowded.length > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'programmatic-probe',
               impact: 'moderate',
               rationale: `${String(crowded.length)} target(s) are smaller than 24x24px and crowded by adjacent targets.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               measurements,
            };
         }

         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'programmatic-probe',
            rationale:
               'All touch targets meet minimum 24px dimensions or maintain sufficient spacing.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            measurements,
         };
      }

      case '3.1.1': {
         const lang = typeof facts.lang === 'string' ? facts.lang.trim() : '';
         if (BCP47_LANGUAGE_TAG.test(lang)) {
            return {
               tier: 0,
               outcome: 'passed',
               confidence: 1,
               method: 'dom-facts',
               rationale: `The html element declares a valid BCP-47 lang="${lang}".`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 0,
            outcome: 'failed',
            confidence: 1,
            method: 'dom-facts',
            impact: 'serious',
            rationale: `The page language is "${lang}", which is missing or not a valid BCP-47 language tag.`,
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '3.1.2': {
         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.7,
            method: 'dom-facts',
            rationale:
               'Passages in a different language require manual inspection for lang attributes.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'inspect-element',
               summary:
                  'Check whether passages in a different language (including Latin-script languages) have lang attributes.',
            },
         };
      }

      case '3.2.1': {
         if (facts.urlUnchangedAfterTab === false) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'dom-facts',
               impact: 'serious',
               rationale:
                  'Focusing a control caused an unexpected navigation away from the current context.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         const tabStops = asArray(facts.tabStops);
         if (tabStops.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No focusable controls observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'dom-facts',
            rationale: 'Tabbing through all controls preserved page context and address.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '3.2.2': {
         const controls = asArray(facts.controls);
         const forms = typeof facts.forms === 'number' ? facts.forms : 0;
         if (controls.length === 0 && forms === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No forms or user input controls observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Verify changing form input settings does not automatically cause unexpected context shifts.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Verify changing the setting of any user interface component does not automatically cause a change of context.',
            },
         };
      }

      case '3.2.3': {
         if (siteFacts?.navSignatures && siteFacts.navSignatures.length > 1) {
            const distinct = new Set(siteFacts.navSignatures);
            if (distinct.size > 1) {
               return {
                  tier: 1,
                  outcome: 'failed',
                  confidence: 0.9,
                  method: 'dom-facts',
                  impact: 'moderate',
                  rationale: `Navigation structure differs across pages (${String(distinct.size)} distinct signatures).`,
                  evidence: [
                     { fingerprint: bundle.fingerprint, path: 'bundle.json#facts' },
                  ],
               };
            }
            return {
               tier: 1,
               outcome: 'passed',
               confidence: 0.9,
               method: 'dom-facts',
               rationale: `Navigation components maintain identical order across all ${String(siteFacts.navSignatures.length)} audited pages.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         if (bundle.heuristics.hasSiteNavigation) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.75,
               method: 'dom-facts',
               rationale:
                  'Site navigation detected; verify consistent relative order across pages.',
               evidence: [
                  { fingerprint: bundle.fingerprint, path: 'bundle.json#heuristics' },
               ],
               nextAction: {
                  kind: 'inspect-element',
                  summary:
                     'Verify navigational mechanisms repeated across pages appear in the same relative order.',
               },
            };
         }

         return {
            tier: 0,
            outcome: 'inapplicable',
            confidence: 1,
            method: 'dom-facts',
            rationale: 'No repeated site navigation observed on page.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '3.2.4': {
         const controls = asArray(facts.controls);
         if (bundle.heuristics.hasSiteNavigation || controls.length > 0) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.75,
               method: 'dom-facts',
               rationale:
                  'Verify components that have the same functionality across pages are identified consistently.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               nextAction: {
                  kind: 'inspect-element',
                  summary:
                     'Verify components that have the same functionality across pages are identified consistently.',
               },
            };
         }

         return {
            tier: 0,
            outcome: 'inapplicable',
            confidence: 1,
            method: 'dom-facts',
            rationale: 'No repeated functional components observed on page.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '3.2.6': {
         if (siteFacts?.helpSignatures && siteFacts.helpSignatures.length > 1) {
            const distinct = new Set(siteFacts.helpSignatures);
            if (distinct.size > 1) {
               return {
                  tier: 2,
                  outcome: 'needsReview',
                  confidence: 0.75,
                  method: 'dom-facts',
                  impact: 'minor',
                  rationale: `Help access points vary across audited pages (${String(distinct.size)} distinct locations).`,
                  evidence: [
                     { fingerprint: bundle.fingerprint, path: 'bundle.json#facts' },
                  ],
                  nextAction: {
                     kind: 'inspect-element',
                     summary:
                        'Verify help access points and self-service options are located consistently across pages.',
                  },
               };
            }
            return {
               tier: 1,
               outcome: 'passed',
               confidence: 0.85,
               method: 'dom-facts',
               rationale:
                  'Help mechanisms appear in consistent relative order across site pages.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         const helpLinks = asArray(facts.helpLinks);
         if (helpLinks.length > 0) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.75,
               method: 'dom-facts',
               rationale: `${String(helpLinks.length)} help mechanism(s) observed; multi-page consistency verification required.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               nextAction: {
                  kind: 'inspect-element',
                  summary:
                     'Verify consistent help access and positioning across multiple pages.',
               },
            };
         }

         return {
            tier: 0,
            outcome: 'inapplicable',
            confidence: 1,
            method: 'dom-facts',
            rationale: 'No help links or contact mechanisms observed on page.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '3.3.1': {
         const forms = typeof facts.forms === 'number' ? facts.forms : 0;
         const controls = asArray(facts.controls);
         if (forms === 0 && controls.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No forms or user input controls observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Input error identification requires interactive form submission testing.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Verify input errors are automatically detected and identified to the user in text.',
            },
         };
      }

      case '3.3.2': {
         const controls = asArray<{ label?: string; type?: string }>(facts.controls);
         if (controls.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No form fields or user input controls observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         const unlabeled = controls.filter(
            (ctrl) =>
               !ctrl.label && !['submit', 'button', 'hidden'].includes(ctrl.type ?? ''),
         );

         if (unlabeled.length > 0) {
            return {
               tier: 1,
               outcome: 'failed',
               confidence: 0.9,
               method: 'dom-facts',
               impact: 'serious',
               rationale: `${String(unlabeled.length)} field(s) lack labels or instructions.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 1,
            outcome: 'passed',
            confidence: 0.9,
            method: 'dom-facts',
            rationale: `All ${String(controls.length)} input fields carry labels or instructions.`,
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '3.3.3': {
         const forms = typeof facts.forms === 'number' ? facts.forms : 0;
         const controls = asArray(facts.controls);
         if (forms === 0 && controls.length === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No forms or user input controls observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Input error suggestions require form submission testing with invalid values.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Verify input error suggestions are provided when detected and known.',
            },
         };
      }

      case '3.3.4': {
         const forms = typeof facts.forms === 'number' ? facts.forms : 0;
         if (forms === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale:
                  'No legal, financial, or data commitment forms observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Verify legal/financial transaction submissions can be reversed, checked, or confirmed.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Verify submissions causing legal or financial commitments can be reversed, checked, or confirmed.',
            },
         };
      }

      case '3.3.7': {
         const controls = asArray(facts.controls);
         if (controls.length <= 1) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No multi-step or redundant entry processes observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Verify previously entered user data is auto-populated or available for selection in multi-step flows.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Verify information previously entered by or provided to the user is auto-populated or available for selection.',
            },
         };
      }

      case '3.3.8': {
         const controls = asArray<{ type?: string; autocomplete?: string | null }>(
            facts.controls,
         );
         const hasAuthControls = controls.some(
            (ctrl) =>
               ctrl.type === 'password' ||
               (typeof ctrl.autocomplete === 'string' &&
                  /current-password|new-password|one-time-code/i.test(ctrl.autocomplete)),
         );

         if (!hasAuthControls) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No authentication or password inputs observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale:
               'Authentication step present; verify cognitive function tests have accessible alternatives.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Verify cognitive function test is not required for authentication unless an alternative is provided.',
            },
         };
      }

      case '4.1.2': {
         const unnamedButtons = asArray<string>(facts.unnamedButtons);
         if (unnamedButtons.length > 0) {
            return {
               tier: 0,
               outcome: 'failed',
               confidence: 1,
               method: 'dom-facts',
               impact: 'critical',
               rationale: `${String(unnamedButtons.length)} control(s) have no accessible name: ${unnamedButtons[0] ?? ''}.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         const interactiveCount =
            typeof facts.interactiveCount === 'number'
               ? facts.interactiveCount
               : asArray(facts.controls).length + asArray(facts.links).length;

         if (interactiveCount > 0) {
            return {
               tier: 2,
               outcome: 'needsReview',
               confidence: 0.75,
               method: 'dom-facts',
               rationale: `${String(interactiveCount)} interactive control(s) present; role, state, and value require verification.`,
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
               nextAction: {
                  kind: 'inspect-element',
                  summary:
                     'Verify custom controls expose correct role, name, state, and value to accessibility APIs.',
               },
            };
         }

         return {
            tier: 0,
            outcome: 'inapplicable',
            confidence: 1,
            method: 'dom-facts',
            rationale: 'No interactive controls observed on page.',
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
         };
      }

      case '4.1.3': {
         const liveRegions =
            typeof facts.liveRegions === 'number' ? facts.liveRegions : 0;
         const forms = typeof facts.forms === 'number' ? facts.forms : 0;

         if (liveRegions === 0 && forms === 0) {
            return {
               tier: 0,
               outcome: 'inapplicable',
               confidence: 1,
               method: 'dom-facts',
               rationale: 'No live regions, status messages, or forms observed on page.',
               evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            };
         }

         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.75,
            method: 'dom-facts',
            rationale: `${String(liveRegions)} live region(s) observed; announcement timing requires assistive technology verification.`,
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json#facts' }],
            nextAction: {
               kind: 'run-procedure',
               summary:
                  'Verify status messages can be programmatically determined through role or properties without receiving focus.',
            },
         };
      }

      default: {
         return {
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.7,
            method: 'dom-facts',
            rationale: `Manual verification required for WCAG criterion ${criterionId}.`,
            evidence: [{ fingerprint: bundle.fingerprint, path: 'bundle.json' }],
            nextAction: {
               kind: 'run-procedure',
               summary: `Assess compliance with WCAG criterion ${criterionId}.`,
            },
         };
      }
   }
}

export function scoreCriterionVerdict(
   bundle: ObservationBundle,
   criterionId: CriterionId,
   options?: ScoreOptions,
): Verdict {
   const verdictId = computeVerdictId({
      criterionId,
      stateId: bundle.stateId,
   });

   // 1. Scope exclusion check first
   if (options?.exclusions && options.exclusions.length > 0) {
      for (const rule of options.exclusions) {
         if (
            matchScopeExclusion(
               { stateId: bundle.stateId, targetUrl: bundle.targetUrl, criterionId },
               [rule],
            )
         ) {
            const excludedVerdict: Verdict = {
               id: verdictId,
               criterionId,
               stateId: bundle.stateId,
               tier: 0,
               outcome: 'excluded',
               confidence: 1,
               method: 'scope-exclusion',
               exclusionReason: rule.reason,
               rationale: `Check excluded by scope rule ${rule.ruleId}: ${rule.reason}`,
               evidence: [
                  {
                     fingerprint: bundle.fingerprint,
                     path: 'bundle.json',
                     note: `Scope exclusion rule ${rule.ruleId}: ${rule.reason}`,
                  },
               ],
               repro: [`Scope exclusion rule ${rule.ruleId} applied`],
               recordedAt: bundle.capturedAt,
            };
            return verdictSchema.parse(excludedVerdict);
         }
      }
   }

   // 2. Axe deterministic violation check (Tier 0, confidence: 1.0)
   const axeViolations = findAxeViolationsForCriterion(
      bundle.axe as Record<string, unknown> | undefined,
      criterionId,
   );

   if (axeViolations.length > 0) {
      const impact = mapAxeImpact(axeViolations);
      const primaryRules = axeViolations
         .map((violation) => violation.id ?? 'unknown')
         .join(', ');
      const totalNodes = axeViolations.reduce(
         (accum, violation) => accum + (violation.nodes ? violation.nodes.length : 0),
         0,
      );

      const axeVoidVerdict: Verdict = {
         id: verdictId,
         criterionId,
         stateId: bundle.stateId,
         tier: 0,
         outcome: 'failed',
         confidence: 1,
         method: 'axe',
         impact,
         rationale: `axe detected deterministic violation(s) for ${criterionId}: ${primaryRules} (${String(totalNodes)} failing element(s)).`,
         evidence: [
            {
               fingerprint: bundle.fingerprint,
               path: 'bundle.json#axe.violations',
            },
         ],
         measurements: collectMeasurements(bundle, criterionId),
         repro: [
            `Observe ${bundle.targetUrl} at state ${bundle.stateId} with axe-core rule(s): ${primaryRules}`,
         ],
         recordedAt: bundle.capturedAt,
      };
      return bindEvidenceSnapshot(bundle, axeVoidVerdict);
   }

   // 3. Strict Soundness & Tier-0 / Tier-1 / Tier-2 Split
   const evaluated = evaluateCriterionPure(bundle, criterionId, options);

   const verdict: Verdict = {
      id: verdictId,
      criterionId,
      stateId: bundle.stateId,
      tier: 2,
      outcome: 'needsReview',
      confidence: 0.75,
      impact: evaluated.impact,
      method: evaluated.method,
      rationale: `Unverified probe observation: ${evaluated.rationale} Criterion-specific assessment is required.`,
      evidence: evaluated.evidence ?? [
         { fingerprint: bundle.fingerprint, path: 'bundle.json' },
      ],
      measurements: evaluated.measurements,
      repro: [`Observe ${bundle.targetUrl} at state ${bundle.stateId}`],
      nextAction: evaluated.nextAction ?? {
         kind: 'run-procedure',
         summary: `Assess the full procedure for WCAG ${criterionId}; the probe covers only bounded observations.`,
      },
      recordedAt: bundle.capturedAt,
   };

   return bindEvidenceSnapshot(bundle, verdict);
}

export function scoreObservationBundle(
   bundle: ObservationBundle,
   options?: ScoreOptions & { criterionIds?: readonly CriterionId[] },
): Verdict[] {
   const criteria = options?.criterionIds ?? WCAG_22_AA_CRITERIA;
   return criteria.map((criterionId) =>
      scoreCriterionVerdict(bundle, criterionId, options),
   );
}
