import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import {
   buildCriterionMeasurements,
   getProbeArtifactPath,
   writeProbeArtifacts,
   type ArtifactInput,
} from './probe-artifacts.js';
import type { PageFacts } from './page-facts.js';

const SCREENSHOT_ATTEMPT = 2;
const ACTION_TRACE_ATTEMPT = 1;
const OBSERVATION_ATTEMPT = 3;
const MEDIA_ATTEMPT = 1;
const MEASUREMENT_ATTEMPT = 1;
const RUN_ATTEMPT = 4;
const ARTIFACT_COUNT = 2;
const SHORT_RUN_ID = 'run-id';
const SHORT_CHECK_ID = 'check-id';
const SHORT_STATE_ID = 'state-id';
const SHORT_FINGERPRINT = 'fp';
const SHORT_URL = 'https://example.com';
const SHORT_ENVIRONMENT_ID = 'env-id';
const SHORT_RATIONALE = 'rationale';
const SHORT_PASS_OUTCOME = 'passed';
const SHORT_OK_RATIONALE = 'ok';

const REFLOW_OVERFLOW_PX = 23;
const ZOOM_OVERFLOW_PX = 640;
const PORTRAIT_OVERFLOW_PX = 12;
const CLIPPED_TEXT_COUNT = 2;
const SMALL_TARGET_WIDTH_A = 17;
const SMALL_TARGET_HEIGHT_A = 44;
const SMALL_TARGET_WIDTH_B = 43;
const SMALL_TARGET_HEIGHT_B = 15;
const MIN_POINTER_TARGET_PX = 24;
const ANIMATION_SPIN_MS = 900;
const ANIMATION_PULSE_MS = 1200;

const sha256 = (body: Buffer): string => createHash('sha256').update(body).digest('hex');

function buildFacts(overrides: Partial<PageFacts> = {}): PageFacts {
   return {
      url: SHORT_URL,
      title: 'Example',
      lang: 'en',
      headings: [{ level: 1, text: 'Example' }],
      landmarks: { main: 1, nav: 1, header: 0, footer: 1 },
      images: [],
      svgImgs: [],
      links: [{ name: 'Home', href: '/', text: 'Home' }],
      unnamedButtons: [],
      controls: [],
      forms: 0,
      media: { video: 0, audio: 0, embeds: [], autoplay: 0, canvas: 0 },
      metaRefresh: false,
      marquee: 0,
      titleAttrs: 0,
      sliders: [],
      liveRegions: 0,
      pointerCursorNonInteractive: [],
      runningAnimations: [],
      bodyText: 'Hello',
      navLinks: ['Home>/'],
      helpLinks: [],
      interactiveCount: 1,
      smallTargets: [],
      instrumented: { mediaPlays: 0, audioContexts: 0, motionListeners: [] },
      listeners: { window: [], document: [], body: [] },
      clickOnNonInteractive: [],
      downHandlers: [],
      tabStops: [],
      urlUnchangedAfterTab: true,
      noIndicator: [],
      trapSuspected: false,
      skipLink: undefined,
      reflow: { overflowPx: 0, wide: [] },
      zoom200OverflowPx: 0,
      portraitOverflowPx: 0,
      textSpacingClipped: [],
      ...overrides,
   };
}

function createProbeInput(directory: string, attempt: number): ArtifactInput {
   return {
      runFile: join(directory, 'run.json'),
      runId: SHORT_RUN_ID,
      checkId: SHORT_CHECK_ID,
      attempt,
      environmentId: SHORT_ENVIRONMENT_ID,
      kinds: ['observation', 'screenshot'],
      states: [
         {
            stateId: SHORT_STATE_ID,
            revision: 1,
            fingerprint: SHORT_FINGERPRINT,
         },
      ],
      pages: [
         {
            url: SHORT_URL,
            judgement: {
               outcome: SHORT_PASS_OUTCOME,
               rationale: SHORT_OK_RATIONALE,
            },
         },
      ],
      rationale: SHORT_RATIONALE,
      captureScreenshot: async () => Buffer.from('fake-png-bytes'),
   };
}

async function readObservationEnvelope(
   directory: string,
   path?: string,
): Promise<Record<string, unknown>> {
   const body = await readFile(join(directory, path ?? ''));
   return JSON.parse(body.toString('utf8')) as Record<string, unknown>;
}

describe('getProbeArtifactPath', () => {
   it('builds an attempt-scoped path for a screenshot', () => {
      const path = getProbeArtifactPath(SHORT_CHECK_ID, SCREENSHOT_ATTEMPT, 'screenshot');

      expect(path).toBe('artifacts/check-id-a2-screenshot.png');
   });

   it('builds an attempt-scoped path for a JSON artifact', () => {
      const path = getProbeArtifactPath(
         SHORT_CHECK_ID,
         ACTION_TRACE_ATTEMPT,
         'action-trace',
      );

      expect(path).toBe('artifacts/check-id-a1-action-trace.json');
   });

   it('builds an attempt-scoped path for an observation artifact', () => {
      const path = getProbeArtifactPath(
         SHORT_CHECK_ID,
         OBSERVATION_ATTEMPT,
         'observation',
      );

      expect(path).toBe('artifacts/check-id-a3-observation.json');
   });

   it('builds an attempt-scoped path for a media artifact', () => {
      const path = getProbeArtifactPath(SHORT_CHECK_ID, MEDIA_ATTEMPT, 'media');

      expect(path).toBe('artifacts/check-id-a1-media.json');
   });

   it('builds an attempt-scoped path for a measurement artifact', () => {
      const path = getProbeArtifactPath(
         SHORT_CHECK_ID,
         MEASUREMENT_ATTEMPT,
         'measurement',
      );

      expect(path).toBe('artifacts/check-id-a1-measurement.json');
   });
});

describe('writeProbeArtifacts', () => {
   const fixture: { directory?: string | undefined } = {};

   afterEach(async () => {
      if (fixture.directory) {
         await rm(fixture.directory, { recursive: true, force: true });
         fixture.directory = undefined;
      }
   });

   it('writes attempt-scoped artifact files to the run directory', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'a11ied-artifacts-'));
      fixture.directory = directory;
      const input = createProbeInput(directory, RUN_ATTEMPT);

      const artifacts = await writeProbeArtifacts(input);

      expect(artifacts).toHaveLength(ARTIFACT_COUNT);

      const observationArtifact = artifacts.find(
         (artifact) => artifact.kind === 'observation',
      );
      const screenshotArtifact = artifacts.find(
         (artifact) => artifact.kind === 'screenshot',
      );

      expect(observationArtifact?.path).toBe('artifacts/check-id-a4-observation.json');
      expect(screenshotArtifact?.path).toBe('artifacts/check-id-a4-screenshot.png');

      const observationEnvelope = await readObservationEnvelope(
         directory,
         observationArtifact?.path,
      );
      expect(observationEnvelope.kind).toBe('observation');
      expect(observationEnvelope.attempt).toBe(RUN_ATTEMPT);
      expect(observationEnvelope.runId).toBe(SHORT_RUN_ID);

      const screenshotBody = await readFile(
         join(directory, screenshotArtifact?.path ?? ''),
      );
      expect(screenshotBody).toEqual(Buffer.from('fake-png-bytes'));
   });

   it('returns artifacts whose sha256 matches the written bytes', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'a11ied-artifacts-'));
      fixture.directory = directory;
      const input = createProbeInput(directory, MEASUREMENT_ATTEMPT);
      input.kinds = ['screenshot'];

      const artifacts = await writeProbeArtifacts(input);
      const artifact = artifacts[0];

      expect(artifact).toBeDefined();
      expect(sha256(Buffer.from('fake-png-bytes'))).toBe(artifact?.sha256);
   });

   it('serializes criterion-specific measurements without the synthetic per-page unit', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'a11ied-artifacts-'));
      fixture.directory = directory;
      const input = createProbeInput(directory, MEASUREMENT_ATTEMPT);
      input.kinds = ['measurement'];
      input.checkId = '1.4.10:reflow';
      input.pages = [
         {
            url: SHORT_URL,
            facts: buildFacts({
               reflow: { overflowPx: REFLOW_OVERFLOW_PX, wide: ['DIV.hero'] },
            }),
            judgement: { outcome: 'failed', rationale: 'Horizontal overflow of 23px' },
         },
      ];

      const artifacts = await writeProbeArtifacts(input);
      const artifact = artifacts[0];

      expect(artifact).toBeDefined();

      const body = await readFile(join(directory, artifact?.path ?? ''), 'utf8');

      expect(body).not.toContain('failing probes per page');

      const envelope = JSON.parse(body) as {
         content: Array<{ unit: string; method: string }>;
      };
      const units = envelope.content.map((entry) => entry.unit);
      const allowedUnits = new Set(['px', 'ms', 'clipped elements']);

      expect(envelope.content.length).toBeGreaterThan(0);
      expect(units.every((unit) => allowedUnits.has(unit))).toStrictEqual(true);
   });

   it('never serializes the synthetic per-page unit for a measurement criterion', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'a11ied-artifacts-'));
      fixture.directory = directory;
      const input = createProbeInput(directory, MEASUREMENT_ATTEMPT);
      input.kinds = ['measurement'];
      input.checkId = '2.5.8:small-targets';
      input.pages = [
         {
            url: SHORT_URL,
            facts: buildFacts({
               smallTargets: [
                  {
                     html: '<button>Save</button>',
                     width: SMALL_TARGET_WIDTH_A,
                     height: SMALL_TARGET_HEIGHT_A,
                     crowded: false,
                  },
                  {
                     html: '<a>Help</a>',
                     width: SMALL_TARGET_WIDTH_B,
                     height: SMALL_TARGET_HEIGHT_B,
                     crowded: true,
                  },
               ],
            }),
            judgement: { outcome: 'failed', rationale: 'Targets under 24px' },
         },
      ];

      const artifacts = await writeProbeArtifacts(input);
      const artifact = artifacts[0];

      expect(artifact).toBeDefined();

      const body = await readFile(join(directory, artifact?.path ?? ''), 'utf8');

      expect(body).not.toContain('failing probes per page');

      const envelope = JSON.parse(body) as {
         content: Array<{ value: number; unit: string }>;
      };

      expect(envelope.content.map((entry) => entry.value)).toStrictEqual([
         SMALL_TARGET_WIDTH_A,
         SMALL_TARGET_HEIGHT_B,
      ]);
      expect(envelope.content.every((entry) => entry.unit === 'px')).toStrictEqual(true);
   });
});

describe('buildCriterionMeasurements', () => {
   it('reports the 1.4.10 reflow overflow in px for the measured URL', () => {
      const measurements = buildCriterionMeasurements('1.4.10', {
         url: SHORT_URL,
         judgement: { outcome: 'failed', rationale: 'Horizontal overflow of 23px' },
         facts: buildFacts({
            reflow: { overflowPx: REFLOW_OVERFLOW_PX, wide: ['DIV.hero'] },
         }),
      });

      expect(measurements.length).toBeGreaterThan(0);
      expect(measurements[0]?.value).toStrictEqual(REFLOW_OVERFLOW_PX);
      expect(measurements[0]?.unit).toStrictEqual('px');
      expect(measurements[0]?.method).toContain(SHORT_URL);
      expect(measurements[0]?.method).toContain('overflow');
   });

   it('does not present viewport overflow as a text enlargement measurement', () => {
      const measurements = buildCriterionMeasurements('1.4.4', {
         url: SHORT_URL,
         judgement: { outcome: 'failed', rationale: 'Horizontal overflow at 200% zoom' },
         facts: buildFacts({ zoom200OverflowPx: ZOOM_OVERFLOW_PX }),
      });

      expect(measurements).toEqual([]);
   });

   it('reports the 1.3.4 portrait overflow in px for the measured URL', () => {
      const measurements = buildCriterionMeasurements('1.3.4', {
         url: SHORT_URL,
         judgement: { outcome: 'failed', rationale: 'Horizontal overflow in portrait' },
         facts: buildFacts({ portraitOverflowPx: PORTRAIT_OVERFLOW_PX }),
      });

      expect(measurements[0]?.value).toStrictEqual(PORTRAIT_OVERFLOW_PX);
      expect(measurements[0]?.unit).toStrictEqual('px');
      expect(measurements[0]?.method).toContain(SHORT_URL);
   });

   it('reports the clipped element count in clipped elements for 1.4.12', () => {
      const measurements = buildCriterionMeasurements('1.4.12', {
         url: SHORT_URL,
         judgement: {
            outcome: 'failed',
            rationale: 'Lines clipped at text-spacing override',
         },
         facts: buildFacts({ textSpacingClipped: ['<p>a</p>', '<li>b</li>'] }),
      });

      expect(measurements[0]?.value).toStrictEqual(CLIPPED_TEXT_COUNT);
      expect(measurements[0]?.unit).toStrictEqual('clipped elements');
      expect(measurements[0]?.method).toContain(SHORT_URL);
   });

   it('reports the smallest side of each of 2.5.8 target as px', () => {
      const measurements = buildCriterionMeasurements('2.5.8', {
         url: SHORT_URL,
         judgement: { outcome: 'failed', rationale: 'Targets under 24px' },
         facts: buildFacts({
            smallTargets: [
               {
                  html: '<button>Save</button>',
                  width: SMALL_TARGET_WIDTH_A,
                  height: SMALL_TARGET_HEIGHT_A,
                  crowded: false,
               },
               {
                  html: '<a>Help</a>',
                  width: SMALL_TARGET_WIDTH_B,
                  height: SMALL_TARGET_HEIGHT_B,
                  crowded: true,
               },
            ],
         }),
      });

      expect(measurements.map((measurement) => measurement.value)).toStrictEqual([
         SMALL_TARGET_WIDTH_A,
         SMALL_TARGET_HEIGHT_B,
      ]);
      expect(measurements.every((measurement) => measurement.unit === 'px')).toBe(true);
      expect(
         measurements.every((measurement) => measurement.method.includes(SHORT_URL)),
      ).toBe(true);
   });

   it('reports the 24px minimum for 2.5.8 when every target is large enough', () => {
      const measurements = buildCriterionMeasurements('2.5.8', {
         url: SHORT_URL,
         judgement: { outcome: 'passed', rationale: 'No small targets measured' },
         facts: buildFacts({ smallTargets: [] }),
      });

      expect(measurements).toHaveLength(1);
      expect(measurements[0]?.value).toStrictEqual(MIN_POINTER_TARGET_PX);
      expect(measurements[0]?.unit).toStrictEqual('px');
   });
});

describe('buildCriterionMeasurements animation and fallback behavior', () => {
   it('reports animation durations in ms for 2.2.2 and 2.3.1', () => {
      const runningAnimations = [
         { name: 'spin', dur: ANIMATION_SPIN_MS, iter: 3 },
         { name: 'pulse', dur: ANIMATION_PULSE_MS, iter: 1 },
      ];
      const page = {
         url: SHORT_URL,
         judgement: {
            outcome: 'failed' as const,
            rationale: 'Autoplaying animation over 5s',
         },
         facts: buildFacts({ runningAnimations }),
      };

      expect(
         buildCriterionMeasurements('2.2.2', page).map(
            (measurement) => measurement.value,
         ),
      ).toStrictEqual([ANIMATION_SPIN_MS, ANIMATION_PULSE_MS]);
      expect(
         buildCriterionMeasurements('2.2.2', page).every(
            (measurement) => measurement.unit === 'ms',
         ),
      ).toStrictEqual(true);
   });

   it('reports a zero ms animation check when nothing is animating', () => {
      const measurements = buildCriterionMeasurements('2.3.1', {
         url: SHORT_URL,
         judgement: { outcome: 'passed' as const, rationale: 'No running animations' },
         facts: buildFacts({ runningAnimations: [] }),
      });

      expect(measurements).toHaveLength(1);
      expect(measurements[0]?.value).toStrictEqual(0);
      expect(measurements[0]?.unit).toStrictEqual('ms');
   });

   it('falls back to a browser measurement in px when the page was not observed', () => {
      const measurements = buildCriterionMeasurements('1.4.10', {
         url: SHORT_URL,
         judgement: { outcome: 'cantTell' as const, rationale: 'No state was opened' },
         facts: buildFacts({
            reflow: { overflowPx: 0, wide: [] },
         }),
      });

      expect(measurements).toHaveLength(1);
      expect(measurements[0]?.value).toStrictEqual(0);
      expect(measurements[0]?.unit).toStrictEqual('px');
   });

   it('prefers caller-provided measurements over the facts passed to the helper', () => {
      const measurements = [{ value: 42, unit: 'ms' as const, method: 'Direct call' }];

      const result = buildCriterionMeasurements('2.2.2', {
         url: SHORT_URL,
         judgement: { outcome: 'passed' as const, rationale: 'Direct call' },
         facts: buildFacts(),
         measurements,
      });

      expect(result).toEqual(measurements);
   });
});
