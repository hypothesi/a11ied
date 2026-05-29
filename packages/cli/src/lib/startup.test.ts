import { describe, expect, it } from 'vitest';
import { shouldSkipStartupMaintenance } from './startup.js';

describe('startup maintenance preflight', () => {
   it('keeps normal invocations on the full startup path', () => {
      expect(
         shouldSkipStartupMaintenance(['node', 'cli.js', 'wcag', 'show', '4.1.3']),
      ).toBe(false);
   });

   it('skips maintenance for help-like invocations', () => {
      expect(shouldSkipStartupMaintenance(['node', 'cli.js', '--help'])).toBe(true);
      expect(
         shouldSkipStartupMaintenance(['node', 'cli.js', 'run', 'axe', '--help']),
      ).toBe(true);
      expect(shouldSkipStartupMaintenance(['node', 'cli.js', 'help-all'])).toBe(true);
   });

   it('skips maintenance for version output', () => {
      expect(shouldSkipStartupMaintenance(['node', 'cli.js', '--version'])).toBe(true);
   });
});
