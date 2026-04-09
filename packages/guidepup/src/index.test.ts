import { describe, expect, it } from 'vitest';

import {
   createDriverAdapter,
   driverCapabilities,
   guidepupSetupCommand,
} from './index.js';

describe('guidepup driver adapters', () => {
   it('exposes one normalized capability set across all targets', () => {
      expect(createDriverAdapter('virtual').capabilities).toEqual(driverCapabilities);
      expect(createDriverAdapter('voiceover').capabilities).toEqual(driverCapabilities);
      expect(createDriverAdapter('nvda').capabilities).toEqual(driverCapabilities);
   });

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

   it('can start a virtual adapter and read normalized state', async () => {
      const adapter = createDriverAdapter('virtual');
      await adapter.start();

      const state = await adapter.readState([]);
      expect(state.logCursor).toBeGreaterThan(0);
      expect(state.spokenPhraseLog[0]).toBe('document');

      await adapter.stop();
   });

   it('returns setup commands for real targets', () => {
      expect(guidepupSetupCommand('voiceover')).toBe('npx @guidepup/setup --record');
      expect(guidepupSetupCommand('nvda')).toContain('@guidepup/setup');
   });
});
