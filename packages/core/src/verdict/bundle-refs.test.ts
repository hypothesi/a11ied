import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservationBundle, Verdict } from '@a11ied/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
   computeObservationFingerprint,
   writeCachedObservationBundle,
} from '../observe/cache.js';
import {
   createBundleRef,
   createScreenshotBundleRef,
   recordBundleVerdicts,
   resolveBundleRef,
} from './bundle-refs.js';
import { computeVerdictId, readVerdicts } from './store.js';

const BUNDLE_SECTION_NAMES = [
   'axe',
   'tree',
   'facts',
   'contrast',
   'viewports',
   'screenshots',
   'transcript',
   'heuristics',
] as const;

const FINGERPRINT_LENGTH = 64;

const CAPTURED_AT = '2026-11-10T00:00:00.000Z',
   COMPACT_REF_BYTE_LIMIT = 400,
   FINGERPRINT_DEFAULT = 'f'.repeat(FINGERPRINT_LENGTH),
   LARGE_DOM_PADDING = 4096,
   TREE_HASH = 'tree-hash-abc123';

const roots: string[] = [];

afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function createCacheRoot(): Promise<string> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-verdict-refs-'));
   roots.push(root);
   return root;
}

async function createRunDir(): Promise<string> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-verdict-record-'));
   roots.push(root);
   return root;
}

function buildBundle(fingerprint: string): ObservationBundle {
   return {
      version: '1',
      fingerprint,
      targetUrl: 'https://example.test/',
      stateId: 'initial',
      capturedAt: CAPTURED_AT,
      setup: [],
      actionTrace: [],
      treeHash: 'tree-hash-abc123',
      axe: { violations: [] },
      tree: {
         marker: 'raw-tree-payload-marker',
         dom: '<main></main>'.padEnd(LARGE_DOM_PADDING, 'dom-'),
      },
      facts: {
         hasSiteNavigation: true,
         marker: 'raw-facts-payload-marker',
         computed: 'computed-facts'.repeat(LARGE_DOM_PADDING),
      },
      heuristics: {
         hasSiteNavigation: true,
         hasMultipointGesture: false,
         hasDraggable: false,
      },
      contrast: [
         {
            selector: '#menu-toggle',
            tag: 'button',
            text: 'Menu',
            role: 'button',
            isLargeText: false,
            isUiComponent: true,
            samples: [
               {
                  state: 'rest',
                  foregroundColor: 'rgb(0, 0, 0)',
                  backgroundColor: 'rgb(255, 255, 255)',
                  contrastRatio: 21,
               },
            ],
         },
      ],
      viewports: {
         desktop: { width: 1280, height: 900 },
         reflow320: { overflowPx: 0, wideElements: [] },
         zoom200: { overflowPx: 0 },
         portrait: { overflowPx: 0 },
         textSpacingClipped: [],
      },
      screenshots: {
         fullPagePath: 'cache/full-page.png',
         elements: { menuToggle: 'cache/menu-toggle.png' },
      },
      transcript: {
         provenance: 'virtual-dom',
         spokenOrder: ['Menu'],
         headings: [],
         landmarks: ['navigation'],
         links: [],
         formControls: [],
         liveRegions: [],
      },
      interactiveCandidates: [],
   };
}

function buildVerdict(overrides: Partial<Verdict> = {}): Verdict {
   return {
      id: computeVerdictId({ criterionId: '1.4.3', stateId: 'state-1' }),
      criterionId: '1.4.3',
      stateId: 'state-1',
      tier: 1,
      outcome: 'passed',
      confidence: 0.9,
      method: 'axe',
      rationale: 'Checked through a bundle reference.',
      evidence: [],
      repro: ['axe.run(document)'],
      recordedAt: CAPTURED_AT,
      ...overrides,
   };
}

async function seedCachedBundle(
   root: string,
): Promise<{ fingerprint: string; bundle: ObservationBundle }> {
   const fingerprint = computeObservationFingerprint({
      treeHash: TREE_HASH,
      targetUrl: 'https://example.test/',
      setup: [],
   });
   const bundle = buildBundle(fingerprint);
   await writeCachedObservationBundle(root, bundle);

   return { fingerprint, bundle };
}

describe('createBundleRef', () => {
   it('builds a compact ref pointing into cache/<fingerprint>/bundle.json#section', () => {
      const bundle = buildBundle(FINGERPRINT_DEFAULT);
      const ref = createBundleRef(bundle, 'facts');

      expect(ref.path).toBe(`cache/${FINGERPRINT_DEFAULT}/bundle.json#facts`);
      expect(ref.fingerprint).toBe(FINGERPRINT_DEFAULT);
      expect(Buffer.byteLength(JSON.stringify(ref), 'utf8')).toBeLessThan(
         COMPACT_REF_BYTE_LIMIT,
      );
   });

   it('includes pointer and note when provided', () => {
      const bundle = buildBundle(FINGERPRINT_DEFAULT);
      const ref = createBundleRef(bundle, 'contrast', {
         pointer: '#menu-toggle',
         note: 'live contrast',
      });

      expect(ref.pointer).toBe('#menu-toggle');
      expect(ref.note).toBe('live contrast');
   });

   it('omits pointer and note when neither is provided', () => {
      const bundle = buildBundle(FINGERPRINT_DEFAULT);
      const ref = createBundleRef(bundle, 'transcript');

      expect(ref.pointer).toBeUndefined();
      expect(ref.note).toBeUndefined();
   });
});

describe('createScreenshotBundleRef', () => {
   it('points at the full-page screenshot by default', () => {
      const bundle = buildBundle(FINGERPRINT_DEFAULT);
      const ref = createScreenshotBundleRef(bundle);

      expect(ref.path).toBe(`cache/${FINGERPRINT_DEFAULT}/full-page.png`);
      expect(Buffer.byteLength(JSON.stringify(ref), 'utf8')).toBeLessThan(
         COMPACT_REF_BYTE_LIMIT,
      );
   });

   it('points at the named element screenshot when elementKey is supplied', () => {
      const bundle = buildBundle(FINGERPRINT_DEFAULT);
      const ref = createScreenshotBundleRef(bundle, { elementKey: 'menuToggle' });

      expect(ref.path).toBe(`cache/${FINGERPRINT_DEFAULT}/elements/menuToggle.png`);
      expect(Buffer.byteLength(JSON.stringify(ref), 'utf8')).toBeLessThan(
         COMPACT_REF_BYTE_LIMIT,
      );
   });

   it('round-trips pointer and note on screenshot refs', () => {
      const bundle = buildBundle(FINGERPRINT_DEFAULT);
      const ref = createScreenshotBundleRef(bundle, {
         elementKey: 'menuToggle',
         pointer: 'rect:10,20,40,40',
         note: 'crops to the visible toggle',
      });

      expect(ref.pointer).toBe('rect:10,20,40,40');
      expect(ref.note).toBe('crops to the visible toggle');
   });
});

describe('resolveBundleRef', () => {
   it('returns undefined when the fingerprint is not cached', async () => {
      const root = await createCacheRoot();
      const ref = createBundleRef(buildBundle(FINGERPRINT_DEFAULT), 'facts');

      const result = await resolveBundleRef(root, ref);

      expect(result).toBeUndefined();
   });

   it('extracts every known section value from a cached bundle', async () => {
      const root = await createCacheRoot();
      const { fingerprint, bundle } = await seedCachedBundle(root);

      const resolvedList = await Promise.all(
         BUNDLE_SECTION_NAMES.map((section) =>
            resolveBundleRef(root, createBundleRef(bundle, section)),
         ),
      );

      for (const [index, section] of BUNDLE_SECTION_NAMES.entries()) {
         const resolved = resolvedList[index];

         expect(resolved).not.toBeUndefined();
         expect(resolved?.bundle.fingerprint).toBe(fingerprint);
         expect(resolved?.sectionValue).toEqual(bundle[section]);
      }
   });

   it('returns the whole bundle when the ref carries no fragment', async () => {
      const root = await createCacheRoot();
      const { fingerprint, bundle } = await seedCachedBundle(root);
      const ref = { fingerprint, path: `cache/${fingerprint}/bundle.json` };

      const result = await resolveBundleRef(root, ref);

      expect(result?.sectionValue).toEqual(bundle);
   });

   it('treats a trailing empty fragment as absent and returns the whole bundle', async () => {
      const root = await createCacheRoot();
      const { fingerprint, bundle } = await seedCachedBundle(root);
      const ref = { fingerprint, path: `cache/${fingerprint}/bundle.json#` };

      const result = await resolveBundleRef(root, ref);

      expect(result?.sectionValue).toEqual(bundle);
   });
});

describe('recordBundleVerdicts', () => {
   it('persists verdicts referencing one cached bundle without duplicating raw payloads', async () => {
      const cacheRoot = await createCacheRoot();
      const runDir = await createRunDir();
      const { fingerprint, bundle } = await seedCachedBundle(cacheRoot);

      const verdicts: readonly Verdict[] = [
         buildVerdict({
            id: computeVerdictId({ criterionId: '1.1.1', stateId: 'state-1' }),
            criterionId: '1.1.1',
            tier: 0,
            outcome: 'passed',
            confidence: 1,
            evidence: [createBundleRef(bundle, 'facts')],
            recordedAt: CAPTURED_AT,
         }),
         buildVerdict({
            id: computeVerdictId({
               criterionId: '1.4.3',
               stateId: 'state-1',
               procedureId: 'contrast',
            }),
            criterionId: '1.4.3',
            procedureId: 'contrast',
            tier: 1,
            outcome: 'failed',
            confidence: 0.9,
            impact: 'serious',
            evidence: [createBundleRef(bundle, 'contrast')],
            recordedAt: CAPTURED_AT,
         }),
         buildVerdict({
            id: computeVerdictId({
               criterionId: '4.1.2',
               stateId: 'state-1',
               procedureId: 'sr-review',
            }),
            criterionId: '4.1.2',
            procedureId: 'sr-review',
            tier: 2,
            outcome: 'needsReview',
            confidence: 0.6,
            method: 'agent-judgment',
            rationale: 'Transcript ambiguous: two headings share the same label.',
            evidence: [
               createBundleRef(bundle, 'transcript'),
               createScreenshotBundleRef(bundle, { elementKey: 'menuToggle' }),
            ],
            nextAction: {
               kind: 'inspect-element',
               summary: 'Open the SR transcript and confirm the announced heading order.',
            },
            recordedAt: CAPTURED_AT,
         }),
      ];

      const saved = await recordBundleVerdicts(runDir, verdicts);

      expect(saved).toHaveLength(verdicts.length);
      expect(saved.map((verdict) => verdict.evidence)).toEqual(
         verdicts.map((verdict) => verdict.evidence),
      );

      const readBack = await readVerdicts(runDir);

      expect(readBack).toHaveLength(saved.length);

      const rawJsonl = await readFile(join(runDir, 'verdicts.jsonl'), 'utf8');
      // The log holds pointers into the cache, never section payloads.
      expect(rawJsonl).toContain(`cache/${fingerprint}/bundle.json#facts`);
      expect(rawJsonl).toContain(`cache/${fingerprint}/bundle.json#contrast`);
      expect(rawJsonl).toContain(`cache/${fingerprint}/bundle.json#transcript`);
      expect(rawJsonl).toContain(`cache/${fingerprint}/elements/menuToggle.png`);
      expect(rawJsonl).not.toContain('raw-facts-payload-marker');
      expect(rawJsonl).not.toContain('raw-tree-payload-marker');
      expect(Buffer.byteLength(rawJsonl, 'utf8')).toBeLessThan(
         Buffer.byteLength(JSON.stringify(bundle), 'utf8'),
      );
   });
});
