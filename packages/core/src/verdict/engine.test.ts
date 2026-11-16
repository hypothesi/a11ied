/* oxlint-disable max-lines, max-lines-per-function, max-statements, complexity/complexity, no-magic-numbers, unicorn/no-null */
import {
   verdictSchema,
   type CriterionId,
   type ObservationBundle,
   type ScopeExclusionRule,
   type ViewportObservation,
} from '@a11ied/contracts';
import { describe, expect, it } from 'vitest';

import {
   collectMeasurements,
   scoreCriterionVerdict,
   scoreObservationBundle,
   WCAG_22_AA_CRITERIA,
} from './engine.js';
import { computeVerdictId } from './store.js';

function buildSampleBundle(
   overrides: Partial<ObservationBundle> = {},
): ObservationBundle {
   const defaultViewport: ViewportObservation = {
      desktop: { width: 1280, height: 800 },
      reflow320: { overflowPx: 0, wideElements: [] },
      zoom200: { overflowPx: 0 },
      portrait: { overflowPx: 0 },
      textSpacingClipped: [],
   };

   return {
      version: '1',
      targetUrl: 'https://example.com/test',
      stateId: 'state-root',
      capturedAt: '2026-11-10T12:00:00.000Z',
      fingerprint: 'fp-test-12345678',
      setup: [],
      actionTrace: [],
      treeHash: 'th-12345678',
      facts: {
         title: 'Accessible Testing Page',
         lang: 'en-US',
         landmarks: { main: 1, nav: 1 },
         skipLink: '#main-content',
         headings: [{ level: 1, text: 'Main Heading' }],
         links: [{ name: 'Documentation', href: '/docs' }],
         controls: [{ type: 'button', label: 'Submit form' }],
         tabStops: [
            { id: 'btn-1', obscured: false, inView: true },
            { id: 'btn-2', obscured: false, inView: true },
         ],
         interactiveCount: 2,
         media: { video: 0, audio: 0, autoplay: 0, embeds: [] },
         runningAnimations: [],
         smallTargets: [],
         noIndicator: [],
         clickOnNonInteractive: [],
         trapSuspected: false,
         metaRefresh: false,
         urlUnchangedAfterTab: true,
      },
      axe: {
         violations: [],
         incomplete: [],
         passes: [],
         inapplicable: [],
      },
      tree: {},
      contrast: [
         {
            selector: 'h1',
            tag: 'h1',
            text: 'Main Heading',
            isLargeText: true,
            isUiComponent: false,
            samples: [
               {
                  state: 'rest',
                  contrastRatio: 7.5,
                  foregroundColor: '#111111',
                  backgroundColor: '#ffffff',
               },
            ],
         },
      ],
      viewports: defaultViewport,
      screenshots: {
         fullPagePath: 'cache/fp-1/vp-desktop.png',
         elements: {},
      },
      transcript: {
         provenance: 'virtual-dom',
         spokenOrder: [],
         headings: [],
         landmarks: [],
         links: [],
         formControls: [],
         liveRegions: [],
      },
      interactiveCandidates: [],
      heuristics: {
         hasSiteNavigation: true,
         hasDraggable: false,
         hasMultipointGesture: false,
      },
      ...overrides,
   };
}

describe('WCAG_22_AA_CRITERIA', () => {
   it('contains all 55 WCAG 2.2 Level A and AA criteria', () => {
      expect(WCAG_22_AA_CRITERIA).toHaveLength(55);
      expect(WCAG_22_AA_CRITERIA[0]).toBe('1.1.1');
      expect(WCAG_22_AA_CRITERIA.at(-1)).toBe('4.1.3');

      // Verify no duplicates
      const uniqueCriteria = new Set(WCAG_22_AA_CRITERIA);
      expect(uniqueCriteria.size).toBe(55);

      // Verify format
      for (const criterionId of WCAG_22_AA_CRITERIA) {
         expect(criterionId).toMatch(/^\d+\.\d+\.\d+$/u);
      }
   });
});

describe('scoreObservationBundle', () => {
   it('scores all 55 criteria and produces valid Verdict objects', () => {
      const bundle = buildSampleBundle();
      const verdicts = scoreObservationBundle(bundle);

      expect(verdicts).toHaveLength(55);

      for (const verdict of verdicts) {
         expect(() => verdictSchema.parse(verdict)).not.toThrow();
         expect(verdict.stateId).toBe(bundle.stateId);
         expect(verdict.recordedAt).toBe(bundle.capturedAt);
         expect(verdict.id).toBe(
            computeVerdictId({
               criterionId: verdict.criterionId,
               stateId: bundle.stateId,
            }),
         );
      }
   });

   it('is strictly idempotent for identical bundles', () => {
      const bundle = buildSampleBundle();
      const run1 = scoreObservationBundle(bundle);
      const run2 = scoreObservationBundle(bundle);

      expect(run1).toEqual(run2);
   });

   it('filters by requested criterionIds when specified in options', () => {
      const bundle = buildSampleBundle();
      const criteria: readonly CriterionId[] = ['1.1.1', '1.4.3', '2.4.7'];
      const verdicts = scoreObservationBundle(bundle, { criterionIds: criteria });

      expect(verdicts).toHaveLength(3);
      expect(verdicts.map((verdict) => verdict.criterionId)).toEqual(criteria);
   });
});

describe('full criterion observation boundary', () => {
   it.each(WCAG_22_AA_CRITERIA)(
      'keeps %s unresolved from a bounded snapshot',
      (criterionID) => {
         const verdict = scoreCriterionVerdict(buildSampleBundle(), criterionID);

         expect(verdict.outcome).toBe('needsReview');
         expect(verdict.nextAction).toBeDefined();
      },
   );

   it.each(WCAG_22_AA_CRITERIA)(
      'keeps %s unresolved when facts are missing',
      (criterionID) => {
         const verdict = scoreCriterionVerdict(
            buildSampleBundle({ facts: {}, contrast: [] }),
            criterionID,
         );

         expect(verdict.outcome).toBe('needsReview');
      },
   );
});

describe('Tier 0/1 vs. Tier 2 soundness boundaries (P0-1, P0-2)', () => {
   it('restricts confidence 1.0 strictly to Tier 0', () => {
      const bundle = buildSampleBundle();
      const verdicts = scoreObservationBundle(bundle);

      for (const verdict of verdicts) {
         if (verdict.confidence === 1) {
            expect(verdict.tier).toBe(0);
         } else {
            expect(verdict.tier).toBeGreaterThanOrEqual(1);
         }
      }
   });

   it('requires structured nextAction for all needsReview verdicts', () => {
      const bundle = buildSampleBundle();
      const verdicts = scoreObservationBundle(bundle);

      for (const verdict of verdicts) {
         if (verdict.outcome === 'needsReview') {
            expect(verdict.nextAction).toBeDefined();
            expect(typeof verdict.nextAction?.kind).toBe('string');
            expect(typeof verdict.nextAction?.summary).toBe('string');
            expect(verdict.nextAction?.summary.length).toBeGreaterThan(0);
         }
      }
   });
});

describe('False-pass guardrails (FR-2 / a11ied-proof-9uz.25.2)', () => {
   it('1.1.1: emits needsReview (Tier 2) when images have alt text, NOT passed', () => {
      const bundle = buildSampleBundle({
         facts: {
            images: [{ src: 'hero.png', alt: 'Hero promotional banner' }],
         },
      });

      const verdict = scoreCriterionVerdict(bundle, '1.1.1');
      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.confidence).toBe(0.75);
      expect(verdict.nextAction?.kind).toBe('review-visual');
   });

   it('1.1.1: retains unresolved observations when images lack alt attribute', () => {
      const bundle = buildSampleBundle({
         facts: {
            images: [{ src: 'hero.png' }],
         },
      });

      const verdict = scoreCriterionVerdict(bundle, '1.1.1');
      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.confidence).toBe(0.75);
   });

   it('1.1.1: keeps absence unresolved when no images or SVGs exist', () => {
      const bundle = buildSampleBundle({
         facts: {
            images: [],
            svgImgs: [],
            canvas: 0,
            media: { video: 0, audio: 0, autoplay: 0, embeds: [] },
         },
      });

      const verdict = scoreCriterionVerdict(bundle, '1.1.1');
      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.confidence).toBe(0.75);
   });

   it('1.4.1 (use of color): emits needsReview (Tier 2), NEVER auto-passes', () => {
      const bundle = buildSampleBundle();
      const verdict = scoreCriterionVerdict(bundle, '1.4.1');

      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.confidence).toBe(0.75);
      expect(verdict.nextAction?.kind).toBe('review-visual');
   });

   it('2.1.1 (keyboard): emits needsReview (Tier 2) when interactive controls exist', () => {
      const bundle = buildSampleBundle({
         facts: {
            interactiveCount: 5,
            clickOnNonInteractive: [],
         },
      });

      const verdict = scoreCriterionVerdict(bundle, '2.1.1');
      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.confidence).toBe(0.75);
      expect(verdict.nextAction?.kind).toBe('run-procedure');
   });

   it('2.1.1 (keyboard): retains unresolved observations when non-interactive elements have click handlers', () => {
      const bundle = buildSampleBundle({
         facts: {
            interactiveCount: 5,
            clickOnNonInteractive: ['div.custom-button', 'span.clickable'],
         },
      });

      const verdict = scoreCriterionVerdict(bundle, '2.1.1');
      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.confidence).toBe(0.75);
   });

   it('3.1.2 (language of parts): emits needsReview (Tier 2), NEVER auto-passes', () => {
      const bundle = buildSampleBundle();
      const verdict = scoreCriterionVerdict(bundle, '3.1.2');

      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.confidence).toBe(0.75);
      expect(verdict.nextAction?.kind).toBe('inspect-element');
   });
});

describe('Measurement Soundness (a11ied-proof-5qp / FR-3)', () => {
   it.each([false, true])(
      'keeps keyboard escape unresolved when trapSuspected is %s',
      (trapSuspected) => {
         const bundle = buildSampleBundle();
         bundle.facts.trapSuspected = trapSuspected;
         const verdict = scoreCriterionVerdict(bundle, '2.1.2');

         expect(verdict.outcome).toBe('needsReview');
         expect(verdict.tier).toBe(2);
         expect(verdict.nextAction?.kind).toBe('run-procedure');
      },
   );

   it('does not infer keyboard-trap inapplicability from an empty tab sample', () => {
      const bundle = buildSampleBundle();
      bundle.facts.tabStops = [];
      const verdict = scoreCriterionVerdict(bundle, '2.1.2');

      expect(verdict.outcome).toBe('needsReview');
   });

   it.each(['1.4.3', '1.4.11'] as const)(
      'does not pass %s when no contrast samples were collected',
      (criterionID) => {
         const verdict = scoreCriterionVerdict(
            buildSampleBundle({ contrast: [] }),
            criterionID,
         );

         expect(verdict.outcome).toBe('needsReview');
         expect(verdict.nextAction?.kind).toBe('review-visual');
      },
   );

   it('1.4.3 & 1.4.11: populate contrastRatio measurements and retain low contrast observations', () => {
      const failingBundle = buildSampleBundle({
         contrast: [
            {
               selector: 'p.caption',
               tag: 'p',
               text: 'caption',
               isLargeText: false,
               isUiComponent: false,
               samples: [
                  {
                     state: 'rest',
                     contrastRatio: 2.8,
                     foregroundColor: '#888888',
                     backgroundColor: '#ffffff',
                  },
               ],
            },
         ],
      });

      const verdict = scoreCriterionVerdict(failingBundle, '1.4.3');
      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.measurements).toBeDefined();
      expect(verdict.measurements?.[0]?.unit).toBe('contrastRatio');
      expect(verdict.measurements?.[0]?.value).toBe(2.8);
      expect(verdict.measurements?.[0]?.threshold).toBe(4.5);
      expect(verdict.measurements?.[0]?.pass).toBe(false);
   });

   it('keeps text resizing unresolved while retaining actual reflow measurements', () => {
      const zoomBundle = buildSampleBundle({
         viewports: {
            ...buildSampleBundle().viewports,
            zoom200: {
               ...buildSampleBundle().viewports.zoom200,
               overflowPx: 42,
            },
         },
      });

      const verdict144 = scoreCriterionVerdict(zoomBundle, '1.4.4');
      expect(verdict144.outcome).toBe('needsReview');
      expect(verdict144.tier).toBe(2);
      expect(verdict144.measurements).toBeUndefined();
      expect(collectMeasurements(zoomBundle, '1.4.4')).toBeUndefined();
      expect(scoreCriterionVerdict(buildSampleBundle(), '1.4.4').outcome).toBe(
         'needsReview',
      );

      const reflowBundle = buildSampleBundle({
         viewports: {
            ...buildSampleBundle().viewports,
            reflow320: {
               ...buildSampleBundle().viewports.reflow320,
               overflowPx: 80,
            },
         },
      });

      const verdict1410 = scoreCriterionVerdict(reflowBundle, '1.4.10');
      expect(verdict1410.outcome).toBe('needsReview');
      expect(verdict1410.tier).toBe(2);
      expect(verdict1410.measurements?.[0]?.metric).toBe('reflow320.overflowPx');
      expect(verdict1410.measurements?.[0]?.unit).toBe('px');
      expect(verdict1410.measurements?.[0]?.value).toBe(80);
   });

   it('1.4.12: populates count measurements for text spacing clipping', () => {
      const textSpacingBundle = buildSampleBundle({
         viewports: {
            ...buildSampleBundle().viewports,
            textSpacingClipped: ['div.card-body', 'button.submit'],
         },
      });

      const verdict = scoreCriterionVerdict(textSpacingBundle, '1.4.12');
      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.measurements?.[0]?.metric).toBe('textSpacingClipped.length');
      expect(verdict.measurements?.[0]?.unit).toBe('count');
      expect(verdict.measurements?.[0]?.value).toBe(2);
   });

   it('2.2.2 & 2.3.1: populate ms duration and Hz frequency measurements', () => {
      const animBundle = buildSampleBundle({
         facts: {
            runningAnimations: [{ name: 'spinner', dur: 8000, iter: null }],
         },
      });

      const verdict222 = scoreCriterionVerdict(animBundle, '2.2.2');
      expect(verdict222.outcome).toBe('needsReview');
      expect(verdict222.tier).toBe(2);
      expect(verdict222.measurements?.[0]?.unit).toBe('ms');
      expect(verdict222.measurements?.[0]?.value).toBe(8000);

      const flashBundle = buildSampleBundle({
         facts: {
            runningAnimations: [{ name: 'strobe', dur: 200, iter: null }],
         },
      });

      const verdict231 = scoreCriterionVerdict(flashBundle, '2.3.1');
      expect(verdict231.outcome).toBe('needsReview');
      expect(verdict231.measurements?.[0]?.unit).toBe('Hz');
      expect(verdict231.measurements?.[0]?.value).toBe(5);
   });

   it('2.5.8: populates target size in px against 24px threshold', () => {
      const targetBundle = buildSampleBundle({
         facts: {
            smallTargets: [
               {
                  html: '<button class="tiny">x</button>',
                  width: 16,
                  height: 16,
                  crowded: true,
               },
            ],
         },
      });

      const verdict = scoreCriterionVerdict(targetBundle, '2.5.8');
      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.measurements).toBeDefined();
      expect(verdict.measurements?.[0]?.unit).toBe('px');
      expect(verdict.measurements?.[0]?.threshold).toBe(24);
      expect(verdict.measurements?.[0]?.pass).toBe(false);
   });

   it('verdicts never contain legacy probe text: failing probes per page', () => {
      const bundle = buildSampleBundle();
      const verdicts = scoreObservationBundle(bundle);
      const json = JSON.stringify(verdicts);

      expect(json).not.toContain('failing probes per page');
   });
});

describe('Scope Exclusions (FR-5)', () => {
   it('emits excluded Tier 0 verdict when a ScopeExclusionRule matches stateId', () => {
      const bundle = buildSampleBundle({ stateId: 'draft-editor-state' });
      const exclusion: ScopeExclusionRule = {
         ruleId: 'exclude-draft-editor',
         reason: 'Draft editor is in private beta and excluded from audit scope',
         stateIds: ['draft-editor-state'],
      };

      const verdict = scoreCriterionVerdict(bundle, '1.1.1', {
         exclusions: [exclusion],
      });

      expect(verdict.outcome).toBe('excluded');
      expect(verdict.tier).toBe(0);
      expect(verdict.confidence).toBe(1);
      expect(verdict.method).toBe('scope-exclusion');
      expect(verdict.exclusionReason).toBe(exclusion.reason);
   });

   it('emits excluded Tier 0 verdict when a ScopeExclusionRule matches urlPatterns', () => {
      const bundle = buildSampleBundle({
         targetUrl: 'https://example.com/admin/settings',
      });
      const exclusion: ScopeExclusionRule = {
         ruleId: 'exclude-admin',
         reason: 'Admin pages out of scope',
         urlPatterns: [String.raw`^https://example\.com/admin/`],
      };

      const verdict = scoreCriterionVerdict(bundle, '1.4.3', {
         exclusions: [exclusion],
      });

      expect(verdict.outcome).toBe('excluded');
      expect(verdict.tier).toBe(0);
      expect(verdict.confidence).toBe(1);
      expect(verdict.exclusionReason).toBe(exclusion.reason);
   });

   it('ignores exclusion rule when criteria or stateId do not match', () => {
      const bundle = buildSampleBundle({ stateId: 'public-page' });
      const exclusion: ScopeExclusionRule = {
         ruleId: 'exclude-login',
         reason: 'Only login state is excluded',
         stateIds: ['login-page'],
      };

      const verdict = scoreCriterionVerdict(bundle, '1.1.1', {
         exclusions: [exclusion],
      });

      expect(verdict.outcome).not.toBe('excluded');
   });
});

describe('Axe deterministic violation integration', () => {
   it('emits failed (Tier 0, confidence 1.0) when axe detects violation matching criterion tag', () => {
      const bundle = buildSampleBundle({
         axe: {
            violations: [
               {
                  id: 'color-contrast',
                  impact: 'serious',
                  tags: ['wcag2aa', 'wcag143'],
                  nodes: [{ html: '<span>low contrast</span>' }],
               },
            ],
            incomplete: [],
            passes: [],
            inapplicable: [],
         },
      });

      const verdict = scoreCriterionVerdict(bundle, '1.4.3');

      expect(verdict.outcome).toBe('failed');
      expect(verdict.tier).toBe(0);
      expect(verdict.confidence).toBe(1);
      expect(verdict.method).toBe('axe');
      expect(verdict.impact).toBe('serious');
      expect(verdict.rationale).toContain('color-contrast');
   });
});

describe('3.1.1 language declarations require contextual assessment', () => {
   it('requires review when html element declares valid BCP-47 tag', () => {
      const bundle = buildSampleBundle({
         facts: {
            lang: 'en-US',
         },
      });

      const verdict = scoreCriterionVerdict(bundle, '3.1.1');
      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.confidence).toBe(0.75);
   });

   it('requires review when html element has missing or invalid lang', () => {
      const bundle = buildSampleBundle({
         facts: {
            lang: '',
         },
      });

      const verdict = scoreCriterionVerdict(bundle, '3.1.1');
      expect(verdict.outcome).toBe('needsReview');
      expect(verdict.tier).toBe(2);
      expect(verdict.confidence).toBe(0.75);
   });
});

describe('collectMeasurements', () => {
   it('extracts real measurements for supported criteria and returns undefined for unmeasured criteria', () => {
      const bundle = buildSampleBundle();
      const contrastMeasurements = collectMeasurements(bundle, '1.4.3');
      expect(contrastMeasurements).toBeDefined();
      expect(contrastMeasurements?.[0]?.unit).toBe('contrastRatio');

      const unsupportedMeasurements = collectMeasurements(bundle, '1.1.1');
      expect(unsupportedMeasurements).toBeUndefined();
   });
});
