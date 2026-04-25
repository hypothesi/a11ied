import { describe, expect, it } from 'vitest';

import {
   createDriverAdapter,
   driverCapabilities,
   guidepupSetupCommand,
} from './index.js';
import { normalizeDriverKeys } from './key-aliases.js';

describe('guidepup driver adapter capabilities', () => {
   it('exposes one normalized capability set across all targets', () => {
      expect(createDriverAdapter('virtual').capabilities).toEqual(driverCapabilities);
      expect(createDriverAdapter('voiceover').capabilities).toEqual(driverCapabilities);
      expect(createDriverAdapter('nvda').capabilities).toEqual(driverCapabilities);
   });
});

describe('guidepup driver adapter readiness', () => {
   it('reports readiness clearly for the virtual target', async () => {
      const readiness = await createDriverAdapter('virtual').checkReadiness();

      expect(readiness.target).toBe('virtual');
      expect(readiness.status).toBe('ready');
   });

   it('reports unsupported real targets on the wrong host platform', async () => {
      if (process.platform !== 'darwin') {
         const readiness = await createDriverAdapter('voiceover').checkReadiness();
         expect(readiness.status).toBe('unsupported');
         expect(readiness.summary).toContain('macOS');
      }

      if (process.platform !== 'win32') {
         const readiness = await createDriverAdapter('nvda').checkReadiness();
         expect(readiness.status).toBe('unsupported');
         expect(readiness.summary).toContain('Windows');
      }
   });
});

describe('guidepup virtual driver adapter', () => {
   it('can start a virtual adapter and read normalized state', async () => {
      const adapter = createDriverAdapter('virtual');
      await adapter.start();

      const state = await adapter.readState([]);
      expect(state.logCursor).toBeGreaterThan(0);
      expect(state.spokenPhraseLog[0]).toBe('document');

      await adapter.stop();
   });
});

describe('guidepup driver setup and keys', () => {
   it('returns setup commands for real targets', () => {
      expect(guidepupSetupCommand('voiceover')).toBe('npx @guidepup/setup --record');
      expect(guidepupSetupCommand('nvda')).toContain('@guidepup/setup');
   });

   it('normalizes documented driver key aliases before dispatch', () => {
      expect(normalizeDriverKeys('VO+RightArrow', 'voiceover')).toBe(
         'Control+Option+ArrowRight',
      );
      expect(normalizeDriverKeys('VO+Shift+DownArrow', 'voiceover')).toBe(
         'Control+Option+Shift+ArrowDown',
      );
      expect(normalizeDriverKeys('NVDA+N', 'nvda')).toBe('Insert+N');
      expect(normalizeDriverKeys('Nvda+NumPad5', 'nvda')).toBe('Insert+NumPad5');
   });
});
