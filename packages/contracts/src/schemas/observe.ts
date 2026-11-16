import { z } from 'zod';
import { templateGroupMetadataSchema } from './verdict.js';
import { auditEnvironmentSchema } from './audit-run.js';

/**
 * One declarative step used to replay an interactive state (expanded menu, open dialog,
 * form error, and so on) before observation runs. Steps execute in order after navigation
 * and before any fact, axe, tree, or screenshot capture.
 */
export const stateSetupActionSchema = z.discriminatedUnion('action', [
   z.object({ action: z.literal('click'), selector: z.string().min(1) }),
   z.object({
      action: z.literal('press'),
      key: z.string().min(1),
      selector: z.string().min(1).optional(),
   }),
   z.object({
      action: z.literal('fill'),
      selector: z.string().min(1),
      value: z.string(),
   }),
   z.object({ action: z.literal('hover'), selector: z.string().min(1) }),
   z.object({ action: z.literal('focus'), selector: z.string().min(1) }),
   z.object({
      action: z.literal('waitForSelector'),
      selector: z.string().min(1),
      timeoutMs: z.number().int().positive().optional(),
   }),
]);
export type StateSetupAction = z.infer<typeof stateSetupActionSchema>;

/** One replayed setup step with the wall-clock time it completed at and how long it took. */
export const stateSetupTraceEntrySchema = z.object({
   index: z.number().int().nonnegative(),
   action: stateSetupActionSchema,
   at: z.string().min(1),
   durationMs: z.number().nonnegative(),
});
export type StateSetupTraceEntry = z.infer<typeof stateSetupTraceEntrySchema>;

/** Computed colors and contrast ratios for one element in one interaction state. */
export const contrastStateSampleSchema = z.object({
   state: z.enum(['rest', 'focus-visible', 'hover']),
   foregroundColor: z.string(),
   backgroundColor: z.string(),
   outlineColor: z.string().optional(),
   borderColor: z.string().optional(),
   contrastRatio: z.number().nonnegative(),
   minTransitionContrastRatio: z.number().nonnegative().optional(),
   hasVisibleIndicator: z.boolean().optional(),
});
export type ContrastStateSample = z.infer<typeof contrastStateSampleSchema>;

/** Contrast measurements for one element, grouped across its interaction states. */
export const contrastSampleSchema = z.object({
   selector: z.string().min(1),
   tag: z.string().min(1),
   text: z.string(),
   role: z.string().optional(),
   isLargeText: z.boolean(),
   isUiComponent: z.boolean(),
   samples: z.array(contrastStateSampleSchema),
});
export type ContrastSample = z.infer<typeof contrastSampleSchema>;

/**
 * An auto-discovered trigger worth queueing as an interactive state: a disclosure toggle,
 * dialog, tab, form, or menu, together with the setup steps that would put it into its
 * interactive state.
 */
export const interactiveCandidateSchema = z.object({
   kind: z.enum(['disclosure', 'dialog', 'tab', 'form', 'menu']),
   selector: z.string().min(1),
   label: z.string(),
   suggestedSetup: z.array(stateSetupActionSchema).min(1),
});
export type InteractiveCandidate = z.infer<typeof interactiveCandidateSchema>;

/**
 * Summary of the in-process virtual screen reader walk over the DOM. `virtual-dom`
 * provenance distinguishes it from a transcript captured from a real screen reader.
 */
export const virtualSrSummarySchema = z.object({
   provenance: z.literal('virtual-dom'),
   spokenOrder: z.array(z.string()),
   headings: z.array(z.string()),
   landmarks: z.array(z.string()),
   links: z.array(z.string()),
   formControls: z.array(z.string()),
   liveRegions: z.array(z.string()),
});
export type VirtualSrSummary = z.infer<typeof virtualSrSummarySchema>;

/** Viewport-matrix measurements captured on the single loaded page. */
export const viewportObservationSchema = z.object({
   desktop: z.object({ width: z.number().int(), height: z.number().int() }),
   reflow320: z.object({
      overflowPx: z.number(),
      wideElements: z.array(z.string()),
   }),
   zoom200: z.object({ overflowPx: z.number() }),
   portrait: z.object({ overflowPx: z.number() }),
   textSpacingClipped: z.array(z.string()),
});
export type ViewportObservation = z.infer<typeof viewportObservationSchema>;

export const textResizeObservationSchema = z.object({
   factor: z.number().positive(),
   verifiedCount: z.number().int().nonnegative(),
   unverifiedCount: z.number().int().nonnegative(),
   overflowPx: z.number(),
   clippedText: z.array(z.string()),
   screenshotPath: z.string().min(1),
   screenshotDigest: z.string().min(1),
});
export type TextResizeObservation = z.infer<typeof textResizeObservationSchema>;

/** Applicability heuristics for criteria that only apply to certain page shapes. */
export const observationHeuristicsSchema = z.object({
   hasSiteNavigation: z.boolean(),
   hasMultipointGesture: z.boolean(),
   hasDraggable: z.boolean(),
});
export type ObservationHeuristics = z.infer<typeof observationHeuristicsSchema>;

export const observationReceiptSchema = z.object({
   collectorVersion: z.string().min(1),
   digest: z.string().min(1),
   stateId: z.string().min(1),
   capturedAt: z.string().datetime(),
   environmentId: z.string().min(1),
});

/**
 * The complete record of one observation pass over one `(URL, stateSetup)` target.
 * Everything a criterion needs is here so one page load serves every check.
 */
export const observationBundleSchema = z.object({
   version: z.literal('1'),
   environment: auditEnvironmentSchema.optional(),
   excludedSelectors: z.array(z.string().min(1)).optional(),
   navigation: z
      .object({
         requestedURL: z.string().min(1),
         loadedURL: z.string().min(1),
         observedURL: z.string().min(1),
         status: z.number().int().optional(),
         frameURLs: z.array(z.string()),
      })
      .optional(),
   textResize: textResizeObservationSchema.optional(),
   collectionTrace: z
      .array(
         z.object({
            operation: z.enum([
               'virtual-dom-read',
               'keyboard-layout-observation',
               'contrast-sampling',
               'native-screen-reader',
               'site-process-observation',
            ]),
            status: z
               .enum(['completed', 'failed', 'truncated', 'unsupported', 'absent'])
               .optional(),
            limitations: z.array(z.string()).optional(),
            capturedAt: z.string().datetime(),
            stateId: z.string().min(1),
         }),
      )
      .optional(),
   fingerprint: z.string().regex(/^[a-zA-Z0-9_-]+$/u),
   targetUrl: z.string().min(1),
   stateId: z.string().min(1),
   capturedAt: z.string().min(1),
   setup: z.array(stateSetupActionSchema),
   actionTrace: z.array(stateSetupTraceEntrySchema),
   treeHash: z.string().min(1),
   axe: z.record(z.string(), z.unknown()),
   tree: z.record(z.string(), z.unknown()),
   facts: z.record(z.string(), z.unknown()),
   heuristics: observationHeuristicsSchema,
   contrast: z.array(contrastSampleSchema),
   viewports: viewportObservationSchema,
   screenshots: z.object({
      fullPagePath: z.string().min(1),
      fullPageDigest: z.string().optional(),
      elements: z.record(z.string(), z.string()),
   }),
   transcript: virtualSrSummarySchema,
   interactiveCandidates: z.array(interactiveCandidateSchema),
});
export type ObservationBundle = z.infer<typeof observationBundleSchema>;

const MAX_CONDITION_ACTIONS = 128;

export const conditionCaptureRequestSchema = z
   .object({
      condition: z.enum(['default', 'text200', 'reflow320', 'textSpacing']),
      actions: z.array(stateSetupActionSchema).max(MAX_CONDITION_ACTIONS),
   })
   .strict();
export type ConditionCaptureRequest = z.infer<typeof conditionCaptureRequestSchema>;

const capturedImageSchema = z.object({
   path: z.string().min(1),
   digest: z.hash('sha256'),
});

const conditionObservationSchema = z.object({
   width: z.number().int().positive(),
   height: z.number().int().positive(),
   contentWidth: z.number().int().positive(),
   overflowPx: z.number().nonnegative(),
   clippedText: z.array(z.string()),
   conditionVerified: z.literal(true),
   textResize: textResizeObservationSchema
      .omit({ screenshotPath: true, screenshotDigest: true })
      .optional(),
   spacingVerified: z.boolean().optional(),
});

export const conditionCaptureSchema = z.object({
   producer: z.literal('condition-1'),
   rootFingerprint: z.hash('sha256'),
   rootDigest: z.hash('sha256'),
   stateId: z.string().min(1),
   targetUrl: z.string().min(1),
   setup: z.array(stateSetupActionSchema),
   excludedSelectors: z.array(z.string()),
   baselineTreeHash: z.hash('sha256'),
   startedAt: z.string().datetime(),
   capturedAt: z.string().datetime(),
   environment: auditEnvironmentSchema,
   request: conditionCaptureRequestSchema,
   actionTrace: z.array(
      stateSetupTraceEntrySchema.extend({
         screenshot: capturedImageSchema,
         focus: z.record(z.string(), z.unknown()).nullable(),
         focusedSpeech: z.string(),
         url: z.string().min(1),
         observation: conditionObservationSchema,
      }),
   ),
   observation: conditionObservationSchema,
   transcript: virtualSrSummarySchema,
   baselineCondition: conditionObservationSchema,
   screenshots: z.object({
      before: capturedImageSchema,
      after: capturedImageSchema,
   }),
   blockedRequests: z.array(z.object({ method: z.string(), url: z.string() })),
   limitations: z.array(z.string()),
});
export type ConditionCapture = z.infer<typeof conditionCaptureSchema>;

export const reviewTargetStateSchema = z.object({
   stateId: z.string().min(1),
   targetUrl: z.string().min(1),
   templateGroup: templateGroupMetadataSchema.optional(),
   setup: z.array(stateSetupActionSchema).optional(),
   excluded: z.boolean().optional(),
   exclusionReason: z.string().min(1).optional(),
   bundle: observationBundleSchema.optional(),
});

export const observationBundleSliceSchema = z.enum([
   'axe',
   'tree',
   'facts',
   'contrast',
   'transcript',
   'viewports',
   'screenshots',
   'interactiveCandidates',
   'heuristics',
   'collectionTrace',
   'environment',
   'navigation',
   'textResize',
]);
export type ObservationBundleSliceName = z.infer<typeof observationBundleSliceSchema>;
