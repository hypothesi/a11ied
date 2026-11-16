import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ObservationBundle } from '@a11ied/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
   computeObservationFingerprint,
   getObservationBundlePath,
   getObservationCacheDir,
   readCachedObservationBundle,
   writeCachedObservationBundle,
} from './cache.js';

const roots: string[] = [];

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const FIXED_CAPTURED_AT = '2026-11-10T00:00:00.000Z';
const FINGERPRINT_LENGTH = 64;
const JSON_INDENT = 3;

afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function createRoot(): Promise<string> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-observe-cache-'));
   roots.push(root);
   return root;
}

function buildBundle(fingerprint: string): ObservationBundle {
   return {
      version: '1',
      fingerprint,
      targetUrl: 'https://shop.test/cart',
      stateId: 'initial',
      capturedAt: FIXED_CAPTURED_AT,
      setup: [],
      actionTrace: [],
      treeHash: 'tree-hash-abc123',
      axe: { violations: [] },
      tree: { role: 'document' },
      facts: { hasSiteNavigation: true },
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
      interactiveCandidates: [
         {
            kind: 'disclosure',
            selector: '#menu-toggle',
            label: 'Menu',
            suggestedSetup: [{ action: 'click', selector: '#menu-toggle' }],
         },
      ],
   };
}

describe('computeObservationFingerprint', () => {
   it('produces distinct fingerprints for empty setup versus a menu toggle setup', () => {
      const treeHash = 'tree-hash-abc123';
      const targetUrl = 'https://shop.test/';

      const baseline = computeObservationFingerprint({ treeHash, targetUrl, setup: [] });
      const withClick = computeObservationFingerprint({
         treeHash,
         targetUrl,
         setup: [{ action: 'click', selector: '#menu-toggle' }],
      });

      expect(baseline).toMatch(SHA256_HEX);
      expect(withClick).toMatch(SHA256_HEX);
      expect(baseline).not.toStrictEqual(withClick);
   });

   it('is stable for identical inputs', () => {
      const treeHash = 'tree-hash-abc123';
      const targetUrl = 'https://shop.test/catalog/';
      const setup = [{ action: 'click', selector: '#menu-toggle' } as const];

      const first = computeObservationFingerprint({ treeHash, targetUrl, setup });
      const second = computeObservationFingerprint({ treeHash, targetUrl, setup });

      expect(first).toStrictEqual(second);
   });
});

describe('getObservationCacheDir', () => {
   it('resolves <root>/cache/<fingerprint>', () => {
      const fingerprint = 'deadbeef';

      expect(getObservationCacheDir('/tmp/a11ied', fingerprint)).toBe(
         '/tmp/a11ied/cache/deadbeef',
      );
      expect(getObservationBundlePath('/tmp/a11ied', fingerprint)).toBe(
         '/tmp/a11ied/cache/deadbeef/bundle.json',
      );
   });
});

describe('writeCachedObservationBundle', () => {
   it('writes cache/<fingerprint>/bundle.json and round-trips it identically', async () => {
      const root = await createRoot();
      const targetUrl = 'https://shop.test/cart';
      const treeHash = 'tree-hash-abc123';
      const fingerprint = computeObservationFingerprint({
         treeHash,
         targetUrl,
         setup: [],
      });
      const bundle = { ...buildBundle(fingerprint), targetUrl, treeHash };

      const writtenPath = await writeCachedObservationBundle(root, bundle);

      expect(writtenPath).toBe(join(root, 'cache', fingerprint, 'bundle.json'));

      const onDisk = await readFile(writtenPath, 'utf8');

      expect(() => JSON.parse(onDisk)).not.toThrow();

      const roundTrip = await readCachedObservationBundle(root, fingerprint);

      expect(roundTrip).toEqual(bundle);
   });
});

describe('readCachedObservationBundle', () => {
   it('returns undefined on cache miss (ENOENT)', async () => {
      const root = await createRoot();
      const fingerprint = 'f'.repeat(FINGERPRINT_LENGTH);

      const result = await readCachedObservationBundle(root, fingerprint);

      expect(result).toBeUndefined();
   });

   it('rejects a cached bundle whose fingerprint does not match the requested fingerprint', async () => {
      const root = await createRoot();
      const targetUrl = 'https://shop.test/cart';
      const treeHash = 'tree-hash-abc123';
      const realFingerprint = computeObservationFingerprint({
         treeHash,
         targetUrl,
         setup: [],
      });
      const forgedFingerprint = computeObservationFingerprint({
         treeHash,
         targetUrl,
         setup: [{ action: 'click', selector: '#menu-toggle' }],
      });
      const bundle = { ...buildBundle(realFingerprint), targetUrl, treeHash };
      const bundlePath = await writeCachedObservationBundle(root, bundle);
      // Rewrite the cached bundle in place; the stored file now claims a forged fingerprint.
      // This must not match the content-addressed path it was written under.
      await writeFile(
         bundlePath,
         `${JSON.stringify({ ...bundle, fingerprint: forgedFingerprint }, undefined, JSON_INDENT)}\n`,
         'utf8',
      );

      await expect(readCachedObservationBundle(root, realFingerprint)).rejects.toThrow(
         /fingerprint mismatch/iu,
      );
   });

   it('rejects a cached bundle that fails schema validation', async () => {
      const root = await createRoot();
      const fingerprint = computeObservationFingerprint({
         treeHash: 'tree-hash-abc123',
         targetUrl: 'https://shop.test/',
      });
      const cacheDir = getObservationCacheDir(root, fingerprint);

      await writeCachedObservationBundle(root, {
         ...buildBundle(fingerprint),
         targetUrl: 'https://shop.test/',
         treeHash: 'tree-hash-abc123',
      });
      await writeFile(
         join(cacheDir, 'bundle.json'),
         `${JSON.stringify({ version: '2', fingerprint })}\n`,
         'utf8',
      );

      await expect(readCachedObservationBundle(root, fingerprint)).rejects.toThrow();
   });
});
