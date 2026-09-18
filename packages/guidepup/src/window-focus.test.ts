import { describe, expect, it } from 'vitest';

import { isFrontmostMatch, parseMacFrontmostOutput } from './window-focus.js';

describe('parseMacFrontmostOutput', () => {
   it('keeps spaces in app names and window titles', () => {
      expect(
         parseMacFrontmostOutput(
            'Google Chrome\u001Ecom.google.Chrome\u001E717\u001EExample page - Google Chrome\n',
         ),
      ).toEqual({
         appName: 'Google Chrome',
         bundleId: 'com.google.Chrome',
         pid: 717,
         windowTitle: 'Example page - Google Chrome',
      });
   });
});

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
