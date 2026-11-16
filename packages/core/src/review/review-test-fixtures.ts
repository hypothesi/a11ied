import { join } from 'node:path';
import {
   getObservationDigest,
   OBSERVATION_COLLECTOR_VERSION,
   writeAtomic,
   writeCachedObservationBundle,
} from '@a11ied/observe';
import {
   start,
   type StartReviewInput,
   type StartReviewResult,
   type JudgeVerdictInput,
   type ReviewCheckItem,
} from '@a11ied/review';
import type { CriterionId, ObservationBundle, Verdict } from '@a11ied/contracts';
import { createBundleRef, resolveEvidenceProcedure } from '@a11ied/verdict';

export function createCompletedAssessment(
   criterionId: CriterionId,
   bundle: ObservationBundle,
): Pick<Verdict, 'procedureId' | 'assessment' | 'evidence'> {
   const evidence = [
         createBundleRef(bundle, 'facts'),
         createBundleRef(bundle, 'transcript'),
         createBundleRef(bundle, 'collectionTrace'),
      ],
      procedure = resolveEvidenceProcedure({ criterionId });
   return {
      procedureId: procedure.procedureId,
      evidence,
      assessment: {
         version: procedure.version,
         actions: procedure.actions.map((action, index) => ({
            index,
            outcome: 'passed' as const,
            observation: `Fixture inspection: ${action}`,
            evidence,
         })),
      },
   };
}

export function createPassedJudgment(
   check: ReviewCheckItem,
   bundle: ObservationBundle,
): JudgeVerdictInput {
   return {
      criterionId: check.criterionId,
      stateId: check.stateId,
      outcome: 'passed',
      ...createCompletedAssessment(check.criterionId, bundle),
      rationale: 'Fixture procedure completed.',
   };
}

export function createMockBundle(
   overrides: Partial<ObservationBundle> = {},
): ObservationBundle {
   const fingerprint = overrides.fingerprint ?? 'fp-mock-bundle-1';
   return {
      version: '1',
      fingerprint,
      targetUrl: 'https://example.com/test',
      stateId: 'root',
      capturedAt: '2026-11-10T12:00:00.000Z',
      setup: [],
      collectionTrace: [
         {
            operation: 'virtual-dom-read',
            status: 'completed',
            capturedAt: '2026-11-10T12:00:00.000Z',
            stateId: overrides.stateId ?? 'root',
         },
      ],
      environment: {
         environmentId: 'test-virtual',
         platform: 'virtual',
         os: 'fixture',
         capabilities: ['rendered-ui', 'screen-reader', 'speech', 'keyboard', 'dom'],
         limitations: ['Test fixture'],
      },
      actionTrace: [
         {
            index: 0,
            action: { action: 'press', key: 'Tab' },
            at: '2026-11-10T12:00:00.000Z',
            durationMs: 1,
         },
      ],
      treeHash: 'tree-hash-mock',
      axe: {
         passes: [],
         violations: [],
         incomplete: [],
         inapplicable: [],
      },
      tree: {
         yaml: 'root: page',
         nodes: [],
      },
      facts: {
         title: 'Accessible Mock Page',
         lang: 'en',
         landmarks: { main: 1, nav: 1 },
         skipLink: '#main-content',
         headings: [{ level: 1, text: 'Heading 1' }],
         links: [{ name: 'Home', href: '/' }],
         controls: [{ type: 'button', label: 'Submit' }],
         tabStops: [{ id: 'btn-1', obscured: false, inView: true }],
         interactiveCount: 1,
         media: { video: 0, audio: 0, autoplay: 0, embeds: [] },
         runningAnimations: [],
         smallTargets: [],
         noIndicator: [],
         clickOnNonInteractive: [],
         trapSuspected: false,
         metaRefresh: false,
         urlUnchangedAfterTab: true,
      },
      heuristics: {
         hasSiteNavigation: true,
         hasMultipointGesture: false,
         hasDraggable: false,
      },
      contrast: [
         {
            selector: 'h1',
            tag: 'h1',
            text: 'Heading 1',
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
      viewports: {
         desktop: { width: 1280, height: 800 },
         reflow320: { overflowPx: 0, wideElements: [] },
         zoom200: { overflowPx: 0 },
         portrait: { overflowPx: 0 },
         textSpacingClipped: [],
      },
      screenshots: {
         fullPagePath: `cache/${fingerprint}/full.png`,
         elements: {},
      },
      transcript: {
         provenance: 'virtual-dom',
         spokenOrder: ['Heading 1', 'Home', 'Submit'],
         headings: ['Heading 1'],
         landmarks: ['main', 'nav'],
         links: ['Home'],
         formControls: ['Submit'],
         liveRegions: [],
      },
      interactiveCandidates: [],
      ...overrides,
   };
}

export async function seedObservationFixture(
   runDir: string,
   bundle: ObservationBundle,
): Promise<void> {
   await writeCachedObservationBundle(runDir, bundle);
   await writeAtomic(join(runDir, 'cache', bundle.fingerprint, 'capture-receipt.json'), {
      collectorVersion: OBSERVATION_COLLECTOR_VERSION,
      digest: getObservationDigest(bundle),
      stateId: bundle.stateId,
      capturedAt: bundle.capturedAt,
      environmentId: bundle.environment?.environmentId,
   });
}

export async function startFixture(input: StartReviewInput): Promise<StartReviewResult> {
   await Promise.all(
      (input.states ?? []).map(async (state) => {
         if (state.bundle) {
            await seedObservationFixture(input.runDir, state.bundle);
         }
      }),
   );
   const observeTarget = input.observeTarget;
   if (!observeTarget) {
      return start(input);
   }
   return start({
      ...input,
      observeTarget: async (target, index) => {
         const bundle = await observeTarget(target, index);
         await seedObservationFixture(input.runDir, bundle);
         return bundle;
      },
   });
}
