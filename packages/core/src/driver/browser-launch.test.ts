import { describe, expect, it } from 'vitest';

import type { BrowserAutomationCandidate } from '@a11ied/contracts';

import { resolveBrowserChoice } from './browser-launch.js';

const candidates: BrowserAutomationCandidate[] = [
   {
      id: 'chrome',
      label: 'Google Chrome',
      source: 'system',
      launchMode: 'channel',
      location: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
   },
   {
      id: 'msedge',
      label: 'Microsoft Edge',
      source: 'system',
      launchMode: 'channel',
      location: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
   },
];

describe('resolveBrowserChoice', () => {
   it('picks a detected candidate by id, alias, or label', () => {
      expect(resolveBrowserChoice('edge', candidates)).toMatchObject({
         appName: 'Microsoft Edge',
         focusTarget: { appName: 'Microsoft Edge', bundleId: 'com.microsoft.edgemac' },
      });
      expect(resolveBrowserChoice('Google Chrome', candidates).focusTarget.bundleId).toBe(
         'com.google.Chrome',
      );
      expect(resolveBrowserChoice('chrome', candidates).location).toContain(
         'Google Chrome',
      );
   });

   it('opens any other name as an app of that name', () => {
      expect(resolveBrowserChoice('Safari', candidates)).toEqual({
         appName: 'Safari',
         focusTarget: { appName: 'Safari', bundleId: 'com.apple.Safari' },
      });
      expect(resolveBrowserChoice('Arc', candidates)).toEqual({
         appName: 'Arc',
         focusTarget: { appName: 'Arc' },
      });
   });
});
