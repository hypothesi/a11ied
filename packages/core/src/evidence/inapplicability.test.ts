import {
   assessmentProcedureSchema,
   inapplicabilityKindSchema,
   type InapplicabilityKind,
   type ObservationBundle,
} from '@a11ied/contracts';
import { describe, expect, it } from 'vitest';

import {
   verifyBundleInapplicability,
   validateCantTellBlockerCode,
} from './inapplicability.js';

const INAPPLICABILITY_KIND_COUNT = 11;
const EXPECTED_TIER = 2;

function buildBaseBundle(): ObservationBundle {
   return {
      version: '1',
      fingerprint: 'abc123def456',
      targetUrl: 'https://example.test/page',
      stateId: 'initial',
      capturedAt: '2026-11-10T00:00:00.000Z',
      setup: [],
      actionTrace: [],
      treeHash: 'tree-hash-123',
      axe: { violations: [] },
      tree: {
         yaml: '- document:',
         nodes: [{ role: 'document', name: '', children: [] }],
      },
      facts: {
         forms: 0,
         controls: [],
         tables: 0,
         marquee: 0,
         liveRegions: 0,
         metaRefresh: false,
         runningAnimations: [],
         navLinks: [],
         sliders: [],
         media: { video: 0, audio: 0, embeds: [], autoplay: 0, canvas: 0 },
         instrumented: { mediaPlays: 0, audioContexts: 0, motionListeners: [] },
      },
      heuristics: {
         hasSiteNavigation: false,
         hasMultipointGesture: false,
         hasDraggable: false,
      },
      contrast: [],
      viewports: {
         desktop: { width: 1280, height: 900 },
         reflow320: { overflowPx: 0, wideElements: [] },
         zoom200: { overflowPx: 0 },
         portrait: { overflowPx: 0 },
         textSpacingClipped: [],
      },
      screenshots: {
         fullPagePath: 'cache/full-page.png',
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
   };
}

function withFacts(
   bundle: ObservationBundle,
   overrides: Record<string, unknown>,
): ObservationBundle {
   return { ...bundle, facts: { ...bundle.facts, ...overrides } };
}

function withHeuristics(
   bundle: ObservationBundle,
   overrides: Partial<ObservationBundle['heuristics']>,
): ObservationBundle {
   return { ...bundle, heuristics: { ...bundle.heuristics, ...overrides } };
}

function withSpokenOrder(
   bundle: ObservationBundle,
   spokenOrder: string[],
): ObservationBundle {
   return { ...bundle, transcript: { ...bundle.transcript, spokenOrder } };
}

const PRESENT_BUNDLE: Record<
   InapplicabilityKind,
   (bundle: ObservationBundle) => ObservationBundle
> = {
   'media-absence': (bundle) =>
      withFacts(bundle, {
         media: { video: 1, audio: 0, embeds: [], autoplay: 0, canvas: 0 },
      }),
   'no-media-playback': (bundle) =>
      withFacts(bundle, {
         instrumented: { mediaPlays: 2, audioContexts: 0, motionListeners: [] },
      }),
   'no-form': (bundle) => withFacts(bundle, { forms: 1 }),
   'no-table': (bundle) => withFacts(bundle, { tables: 3 }),
   'no-live-region': (bundle) => withFacts(bundle, { liveRegions: 1 }),
   'no-animation': (bundle) =>
      withFacts(bundle, {
         runningAnimations: [{ name: 'spin', dur: 1000, iter: 2 }],
      }),
   'no-timed-event': (bundle) => withFacts(bundle, { metaRefresh: true }),
   'no-multipage-context': (bundle) => withFacts(bundle, { navLinks: ['/about'] }),
   'no-dragging': (bundle) => withHeuristics(bundle, { hasDraggable: true }),
   'no-multipoint-gesture': (bundle) =>
      withHeuristics(bundle, { hasMultipointGesture: true }),
   'no-authentication': (bundle) =>
      withFacts(bundle, {
         controls: [
            {
               tag: 'input',
               type: 'password',
               name: 'password',
               label: 'Password',
               placeholder: '',
               autocomplete: 'current-password',
               required: true,
            },
         ],
      }),
};

const ALL_KINDS = inapplicabilityKindSchema.options;

describe('verifyBundleInapplicability', () => {
   it('covers all 11 inapplicability kinds', () => {
      expect(ALL_KINDS).toHaveLength(INAPPLICABILITY_KIND_COUNT);

      for (const kind of ALL_KINDS) {
         expect(PRESENT_BUNDLE).toHaveProperty(kind);
      }
   });

   for (const kind of ALL_KINDS) {
      it(`marks '${kind}' as inapplicable when the feature is absent`, () => {
         const base = buildBaseBundle();
         const result = verifyBundleInapplicability(base, kind);

         expect(result.kind).toStrictEqual(kind);
         expect(result.inapplicable).toBe(true);
         expect(result.applicable).toBe(false);
         expect(result.observedCount).toBe(0);
         expect(result.reason.length).toBeGreaterThan(0);
      });

      it(`marks '${kind}' as applicable when the feature is present`, () => {
         const base = buildBaseBundle();
         const present = PRESENT_BUNDLE[kind](base);
         const result = verifyBundleInapplicability(present, kind);

         expect(result.kind).toStrictEqual(kind);
         expect(result.inapplicable).toBe(false);
         expect(result.applicable).toBe(true);
         expect(result.observedCount).toBeGreaterThan(0);
      });
   }
});

describe('form and data-entry applicability', () => {
   it('does not treat ordinary navigation buttons as data-entry fields', () => {
      const base = buildBaseBundle();
      const bundle = {
         ...base,
         transcript: {
            ...base.transcript,
            formControls: ['button', 'button: Open navigation'],
         },
      };
      const result = verifyBundleInapplicability(bundle, 'no-form');

      expect(result.inapplicable).toStrictEqual(true);
      expect(result.observedCount).toStrictEqual(0);
   });

   for (const role of ['textbox', 'checkbox', 'switch', 'combobox']) {
      it(`retains a standalone ${role} as data entry without a form element`, () => {
         const base = buildBaseBundle();
         const bundle = {
            ...base,
            transcript: {
               ...base.transcript,
               formControls: ['button: Open navigation', `${role}: Preference`],
            },
         };
         const result = verifyBundleInapplicability(bundle, 'no-form');

         expect(result.applicable).toStrictEqual(true);
         expect(result.observedCount).toStrictEqual(1);
      });
   }

   it('retains native input fields without a form or transcript control', () => {
      const base = buildBaseBundle();
      const bundle = withFacts(base, { controls: [{ tag: 'INPUT', type: 'email' }] });
      const result = verifyBundleInapplicability(bundle, 'no-form');

      expect(result.applicable).toStrictEqual(true);
      expect(result.observedCount).toStrictEqual(1);
   });
});

describe('structured feature applicability', () => {
   it('detects tables via parsed tree roles and spokenOrder entries', () => {
      const base = buildBaseBundle();
      const withTreeTable = {
         ...base,
         tree: {
            yaml: '- table "Cart":',
            nodes: [
               {
                  role: 'document',
                  children: [{ role: 'table', name: 'Cart', children: [] }],
               },
            ],
         },
      };
      const withGridTreeTable = {
         ...base,
         tree: {
            yaml: '- grid:',
            nodes: [{ role: 'grid', children: [] }],
         },
      };
      const withSpokenOrderTable = withSpokenOrder(base, ['table "Cart"']);

      expect(verifyBundleInapplicability(withTreeTable, 'no-table').observedCount).toBe(
         1,
      );
      expect(
         verifyBundleInapplicability(withGridTreeTable, 'no-table').observedCount,
      ).toBe(1);
      expect(
         verifyBundleInapplicability(withSpokenOrderTable, 'no-table').observedCount,
      ).toBe(1);
   });

   it('counts multipoint gesture sliders from facts', () => {
      const base = buildBaseBundle();
      const withSliders = withFacts(base, { sliders: ['amount'] });

      expect(
         verifyBundleInapplicability(withSliders, 'no-multipoint-gesture').observedCount,
      ).toBe(1);
   });

   it('counts media embeds from facts.media.embeds', () => {
      const base = buildBaseBundle();
      const withEmbed = withFacts(base, {
         media: { video: 0, audio: 0, embeds: ['iframe-1'], autoplay: 0, canvas: 0 },
      });

      expect(
         verifyBundleInapplicability(withEmbed, 'no-media-playback').observedCount,
      ).toBe(1);
   });

   it('counts one-time-code autocomplete as an authentication control', () => {
      const base = buildBaseBundle();
      const withOtp = withFacts(base, {
         controls: [
            {
               tag: 'input',
               type: 'text',
               name: 'otp',
               label: 'Code',
               placeholder: '',
               autocomplete: 'one-time-code',
               required: true,
            },
         ],
      });
      const without = withFacts(base, {
         controls: [
            {
               tag: 'input',
               type: 'text',
               name: 'email',
               label: 'Email',
               placeholder: '',
               autocomplete: 'email',
               required: false,
            },
         ],
      });

      expect(
         verifyBundleInapplicability(withOtp, 'no-authentication').observedCount,
      ).toBe(1);
      expect(
         verifyBundleInapplicability(without, 'no-authentication').observedCount,
      ).toBe(0);
   });
});

describe('validateCantTellBlockerCode', () => {
   it('accepts every BlockerCode enum value', () => {
      const validCodes = [
         'capability-unsupported',
         'external-submission-unauthorized',
         'auth-credentials-missing',
         'third-party-out-of-scope',
         'hardware-sensor-unavailable',
         'human-judgment-required',
      ];

      for (const code of validCodes) {
         expect(validateCantTellBlockerCode(code)).toStrictEqual({ valid: true });
      }
   });

   it('rejects unknown codes with a descriptive reason', () => {
      const result = validateCantTellBlockerCode('not-a-real-code');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not-a-real-code');
      expect(result.reason).toContain('capability-unsupported');
   });
});

describe('assessmentProcedureSchema', () => {
   const baseProcedure = {
      procedureId: 'wcag_1_2_2',
      criterionId: '1.2.2',
      version: '1',
      title: 'Assess captions',
      scope: 'state',
      applicability: 'The observed page embeds prerecorded multimedia.',
      requiredCapabilities: ['rendered-ui', 'dom'],
      setup: ['Bind the target and caption the observed state.'],
      actions: ['Play the media and confirm captions are present.'],
      requiredEvidence: ['observation', 'media'],
      evaluation: {
         passed: 'Captions are aligned.',
         failed: 'Captions are missing.',
         inapplicable: 'No multimedia is present.',
         cantTell: 'Media cannot be verified.',
      },
      recovery: ['Stop at the boundary and record the failure.'],
      limitations: ['Results apply only to the recorded state.'],
      sources: [
         { kind: 'normative', url: 'https://www.w3.org/TR/WCAG22/#captions-prerecorded' },
      ],
   };

   it('accepts procedures with tier, toolCalls, done, and widened inapplicability kind', () => {
      const parsed = assessmentProcedureSchema.parse({
         ...baseProcedure,
         tier: 2,
         toolCalls: [
            {
               tool: 'review.capture',
               args: { kind: 'media' },
               expect: 'media inventory is complete',
            },
            { tool: 'sr.verify', expect: 'spoken transcript matches the DOM' },
         ],
         done: {
            passed: 'Captions verified',
            failed: 'Captions missing',
            inapplicable: 'Media absence proven',
            cantTell: 'Media could not be inspected',
            allowedBlockerCodes: ['human-judgment-required'],
            inapplicabilityKind: 'no-media-playback',
         },
         inapplicability: {
            kind: 'no-media-playback',
            requiredCapabilities: ['rendered-ui', 'dom'],
            requiredEvidence: ['action-trace', 'observation', 'media'],
         },
      });

      expect(parsed.tier).toBe(EXPECTED_TIER);
      expect(parsed.done?.allowedBlockerCodes).toStrictEqual(['human-judgment-required']);
      expect(parsed.done?.inapplicabilityKind).toStrictEqual('no-media-playback');
   });

   it('accepts every inapplicability kind in procedure inapplicability', () => {
      for (const kind of ALL_KINDS) {
         expect(() =>
            assessmentProcedureSchema.parse({
               ...baseProcedure,
               inapplicability: {
                  kind,
                  requiredCapabilities: ['rendered-ui', 'dom'],
                  requiredEvidence: ['observation'],
               },
            }),
         ).not.toThrow();
      }
   });

   it('keeps procedures without new N3 fields valid (desktop-procedures.json compat)', () => {
      const parsed = assessmentProcedureSchema.parse({
         ...baseProcedure,
         inapplicability: {
            kind: 'media-absence',
            requiredCapabilities: ['rendered-ui', 'dom'],
            requiredEvidence: ['action-trace', 'observation', 'media'],
         },
      });

      expect(parsed.tier).toBeUndefined();
      expect(parsed.toolCalls).toBeUndefined();
      expect(parsed.done).toBeUndefined();
   });

   it('rejects invalid tier and invalid blocker codes', () => {
      expect(() =>
         assessmentProcedureSchema.parse({ ...baseProcedure, tier: 4 }),
      ).toThrow();
      expect(() =>
         assessmentProcedureSchema.parse({
            ...baseProcedure,
            done: {
               passed: 'ok',
               failed: 'ng',
               inapplicable: 'n/a',
               cantTell: 'dunno',
               allowedBlockerCodes: ['unknown-code'],
            },
         }),
      ).toThrow();
   });
});
