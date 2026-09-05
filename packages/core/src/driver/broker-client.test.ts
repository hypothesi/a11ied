import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTempRoots, createTempRoot } from '../../../cli/src/testing/fixtures.js';

import {
   getBrokerEntryFromPackageRoot,
   resolveBrokerReadyTimeoutMs,
   resolveBrokerSocketTimeoutMs,
} from './broker-client.js';

/** Covers a Chromium launch for the browser engine. */
const DEFAULT_READY_TIMEOUT_MS = 15_000;
const REAL_TARGET_READY_TIMEOUT_MS = 15_000;
const VIRTUAL_SOCKET_TIMEOUT_MS = 2000;
const VIRTUAL_STOP_SOCKET_TIMEOUT_MS = 7000;
const REAL_TARGET_SOCKET_TIMEOUT_MS = 30_000;
const REAL_TARGET_STOP_SOCKET_TIMEOUT_MS = 20_000;
const CALLER_TIMEOUT_MS = 1500;
const RESPONSE_GRACE_MS = 6000;

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
   it('gives a virtual session time to launch a headless browser', () => {
      expect(resolveBrokerReadyTimeoutMs('virtual')).toBe(DEFAULT_READY_TIMEOUT_MS);
   });

   it('gives real screen readers more time to start', () => {
      expect(resolveBrokerReadyTimeoutMs('voiceover')).toBe(REAL_TARGET_READY_TIMEOUT_MS);
      expect(resolveBrokerReadyTimeoutMs('nvda')).toBe(REAL_TARGET_READY_TIMEOUT_MS);
   });

   it('gives stop requests enough time to flush recording state', () => {
      expect(resolveBrokerSocketTimeoutMs({ command: 'stop' })).toBe(
         VIRTUAL_STOP_SOCKET_TIMEOUT_MS,
      );
      expect(resolveBrokerSocketTimeoutMs({ command: 'stop' }, 'voiceover')).toBe(
         REAL_TARGET_STOP_SOCKET_TIMEOUT_MS,
      );
      expect(resolveBrokerSocketTimeoutMs({ command: 'stop' }, 'nvda')).toBe(
         REAL_TARGET_STOP_SOCKET_TIMEOUT_MS,
      );
   });

   it('uses short timeouts for virtual targets', () => {
      expect(resolveBrokerSocketTimeoutMs({ command: 'status' })).toBe(
         VIRTUAL_SOCKET_TIMEOUT_MS,
      );
      expect(resolveBrokerSocketTimeoutMs({ command: 'action' })).toBe(
         VIRTUAL_SOCKET_TIMEOUT_MS,
      );
      expect(resolveBrokerSocketTimeoutMs({ command: 'status' }, 'virtual')).toBe(
         VIRTUAL_SOCKET_TIMEOUT_MS,
      );
   });

   it('gives real screen readers longer timeouts for actions', () => {
      expect(resolveBrokerSocketTimeoutMs({ command: 'action' }, 'voiceover')).toBe(
         REAL_TARGET_SOCKET_TIMEOUT_MS,
      );
      expect(resolveBrokerSocketTimeoutMs({ command: 'status' }, 'nvda')).toBe(
         REAL_TARGET_SOCKET_TIMEOUT_MS,
      );
   });

   it('lets a caller timeout override the fixed constants, plus reply grace', () => {
      expect(
         resolveBrokerSocketTimeoutMs(
            { command: 'action', timeoutMs: CALLER_TIMEOUT_MS },
            'voiceover',
         ),
      ).toBe(CALLER_TIMEOUT_MS + RESPONSE_GRACE_MS);
   });
});
