import { describe, expect, it } from 'vitest';
import { shouldShowUpdateNotice, shouldSkipStartupMaintenance } from './startup.js';

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

describe('update notice', () => {
   it('shows on bare a1, help, and doctor', () => {
      expect(shouldShowUpdateNotice(['node', 'cli.js'])).toBe(true);
      expect(shouldShowUpdateNotice(['node', 'cli.js', '--help'])).toBe(true);
      expect(shouldShowUpdateNotice(['node', 'cli.js', 'axe', '--help'])).toBe(true);
      expect(shouldShowUpdateNotice(['node', 'cli.js', 'doctor'])).toBe(true);
   });

   it('never shows on output that scripts read or on working commands', () => {
      expect(shouldShowUpdateNotice(['node', 'cli.js', 'doctor', '--json'])).toBe(false);
      expect(shouldShowUpdateNotice(['node', 'cli.js', '--version'])).toBe(false);
      expect(
         shouldShowUpdateNotice(['node', 'cli.js', 'axe', 'https://example.com']),
      ).toBe(false);
      expect(shouldShowUpdateNotice(['node', 'cli.js', 'update'])).toBe(false);
   });
});
