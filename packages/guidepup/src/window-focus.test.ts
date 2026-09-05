import { describe, expect, it } from 'vitest';

import { isFrontmostMatch } from './window-focus.js';

describe('isFrontmostMatch', () => {
   it('matches by bundle id before anything else', () => {
      expect(
         isFrontmostMatch(
            { appName: 'Other', bundleId: 'com.google.Chrome' },
            { appName: 'Google Chrome', bundleId: 'com.google.Chrome' },
         ),
      ).toBe(true);
   });

   it('matches app names without case or the .app and .exe suffixes', () => {
      expect(
         isFrontmostMatch({ appName: 'google chrome' }, { appName: 'Google Chrome.app' }),
      ).toBe(true);
      expect(
         isFrontmostMatch({ processName: 'msedge' }, { processName: 'msedge.exe' }),
      ).toBe(true);
   });

   it('matches a window title by contains or exact', () => {
      const frontmost = { appName: 'Safari', windowTitle: 'Checkout - Example' };

      expect(isFrontmostMatch({ windowTitle: 'checkout' }, frontmost)).toBe(true);
      expect(
         isFrontmostMatch({ windowTitle: 'checkout', match: 'exact' }, frontmost),
      ).toBe(false);
   });

   it('reports no match when another app is in front', () => {
      expect(isFrontmostMatch({ appName: 'Safari' }, { appName: 'Terminal' })).toBe(
         false,
      );
   });
});
