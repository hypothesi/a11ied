import { describe, expect, it } from 'vitest';

import {
   isFrontmostMatch,
   parseMacFrontmostOutput,
   parseWindowsFrontmostOutput,
} from './window-focus.js';

describe('parseMacFrontmostOutput', () => {
   it('retains usable PID identity when an application has no name or bundle metadata', () => {
      const pid = 717;
      const foreground = parseMacFrontmostOutput(`\u001E\u001E${String(pid)}\u001E`);

      expect(foreground.pid).toBe(pid);
      expect(isFrontmostMatch({ pid }, foreground)).toBe(true);
   });
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

describe('Windows foreground window parsing', () => {
   it('preserves full titles and rejects malformed process identity', () => {
      const window = {
         appName: 'msedge',
         processName: 'msedge',
         pid: 717,
         windowTitle: 'Checkout - Fireside',
      };

      expect(parseWindowsFrontmostOutput(JSON.stringify(window))).to.eql(window);
      expect(() => parseWindowsFrontmostOutput('{"pid":-1}')).toThrow();
   });
});

describe('combined foreground identities', () => {
   it('requires the requested window even when the process or bundle matches', () => {
      const frontmost = {
         appName: 'Google Chrome',
         bundleId: 'com.google.Chrome',
         pid: 717,
         windowTitle: 'Other window',
      };

      expect(
         isFrontmostMatch({ pid: 717, windowTitle: 'Fireside' }, frontmost),
      ).toStrictEqual(false);
      expect(
         isFrontmostMatch(
            { bundleId: 'com.google.Chrome', windowTitle: 'Fireside' },
            frontmost,
         ),
      ).toStrictEqual(false);
      expect(
         isFrontmostMatch(
            { appName: 'Google Chrome', windowTitle: 'Fireside' },
            frontmost,
         ),
      ).toStrictEqual(false);
      expect(
         isFrontmostMatch({ pid: 718, bundleId: 'com.google.Chrome' }, frontmost),
      ).toStrictEqual(false);
      expect(
         isFrontmostMatch({ pid: 717, bundleId: 'com.apple.Safari' }, frontmost),
      ).toStrictEqual(false);
      expect(
         isFrontmostMatch({ appName: 'Safari', windowTitle: 'Other window' }, frontmost),
      ).toStrictEqual(false);
      expect(
         isFrontmostMatch(
            { pid: 717, windowTitle: 'Other window', match: 'exact' },
            frontmost,
         ),
      ).toStrictEqual(true);
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
