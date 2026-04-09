import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTempRoots, createTempRoot } from '../../../cli/src/testing/fixtures.js';

import {
   getBrokerEntryFromPackageRoot,
   resolveBrokerReadyTimeoutMs,
   resolveBrokerSocketTimeoutMs,
} from './broker-client.js';

const DEFAULT_READY_TIMEOUT_MS = 5000;
const REAL_TARGET_READY_TIMEOUT_MS = 15_000;
const STOP_REQUEST_TIMEOUT_MS = 7000;
const DEFAULT_REQUEST_TIMEOUT_MS = 1000;

const tempRoots: string[] = [];

afterEach(async () => {
   await cleanupTempRoots(tempRoots);
});

describe('broker entry lookup', () => {
   it('prefers the built broker entry inside dist/driver', async () => {
      const root = await createTempRoot(tempRoots);
      const builtEntry = resolve(root, 'dist/driver/broker.js');
      await mkdir(dirname(builtEntry), { recursive: true });
      await writeFile(builtEntry, 'export {};', 'utf8');

      expect(getBrokerEntryFromPackageRoot(root)).toBe(builtEntry);
   });

   it('falls back to the source broker entry when no built file exists', async () => {
      const root = await createTempRoot(tempRoots);
      const sourceEntry = resolve(root, 'src/driver/broker.ts');
      await mkdir(dirname(sourceEntry), { recursive: true });
      await writeFile(sourceEntry, 'export {};', 'utf8');

      expect(getBrokerEntryFromPackageRoot(root)).toBe(sourceEntry);
   });
});

describe('broker startup timing', () => {
   it('keeps the short timeout for virtual sessions', () => {
      expect(resolveBrokerReadyTimeoutMs('virtual')).toBe(DEFAULT_READY_TIMEOUT_MS);
   });

   it('gives real screen readers more time to start', () => {
      expect(resolveBrokerReadyTimeoutMs('voiceover')).toBe(REAL_TARGET_READY_TIMEOUT_MS);
      expect(resolveBrokerReadyTimeoutMs('nvda')).toBe(REAL_TARGET_READY_TIMEOUT_MS);
   });

   it('gives stop requests enough time to flush recording state', () => {
      expect(resolveBrokerSocketTimeoutMs({ command: 'stop' })).toBe(
         STOP_REQUEST_TIMEOUT_MS,
      );
      expect(resolveBrokerSocketTimeoutMs({ command: 'status' })).toBe(
         DEFAULT_REQUEST_TIMEOUT_MS,
      );
   });
});
