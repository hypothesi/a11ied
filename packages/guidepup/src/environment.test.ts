import { describe, expect, it } from 'vitest';

import {
   checkNvdaEnvironment,
   checkVoiceOverEnvironment,
   resolveGuidepupCachePath,
   type GuidepupEnvironmentDeps,
} from './environment.js';

const HOME = '/Users/tester';
const MANIFEST_PATH = '/repo/node_modules/@guidepup/guidepup/manifest.json';
const NO_DEFAULTS: Record<string, string> = {};

function createDeps(
   overrides: Partial<GuidepupEnvironmentDeps> = {},
): GuidepupEnvironmentDeps {
   return {
      platform: 'darwin',
      osRelease: '25.5.0',
      homeDir: HOME,
      env: {},
      existsSync: () => false,
      readDefault: (domain, key) => NO_DEFAULTS[`${domain}:${key}`],
      manifestPath: MANIFEST_PATH,
      readManifest: () => ({
         screenReaders: [
            {
               id: 'voiceover',
               assets: [
                  {
                     version: '0.0.1-VoiceOver4',
                     platformVersion: '25',
                     asset: 'guidepup-voiceover-preferences-macos-26.dmg',
                  },
               ],
            },
         ],
      }),
      ...overrides,
   };
}

describe('guidepup cache path', () => {
   it('honors the GUIDEPUP_SCREEN_READERS_PATH override', () => {
      const cachePath = resolveGuidepupCachePath(
         createDeps({ env: { GUIDEPUP_SCREEN_READERS_PATH: '/custom/cache' } }),
      );

      expect(cachePath).toBe('/custom/cache');
   });

   it('uses the per-platform default locations', () => {
      expect(resolveGuidepupCachePath(createDeps({ platform: 'darwin' }))).toBe(
         `${HOME}/Library/Caches/guidepup`,
      );
      expect(resolveGuidepupCachePath(createDeps({ platform: 'linux' }))).toBe(
         `${HOME}/.cache/guidepup`,
      );
   });
});

describe('VoiceOver environment checks', () => {
   it('reports every missing setup piece with the command that fixes it', () => {
      const checks = checkVoiceOverEnvironment(createDeps());
      const byId = Object.fromEntries(checks.map((check) => [check.id, check]));

      expect(byId['voiceover-applescript-setting']?.status).toBe('fail');
      expect(byId['voiceover-applescript-setting']?.action).toBe(
         'a1 setup',
      );
      expect(byId['voiceover-applescript-system-flag']?.status).toBe('fail');
      expect(byId['voiceover-local-preferences']?.status).toBe('fail');
      expect(byId['voiceover-splash-screen']?.status).toBe('warn');
      expect(byId['voiceover-preferences-bundle']?.status).toBe('fail');
      expect(byId['voiceover-preferences-bundle']?.action).toBe(
         'a1 setup',
      );
   });

   it('prefers the VoiceOver group container when it exists', () => {
      const groupContainer = `${HOME}/Library/Group Containers/group.com.apple.VoiceOver/Library/Preferences`;
      const checks = checkVoiceOverEnvironment(
         createDeps({
            existsSync: (path) =>
               path === groupContainer ||
               path === `${groupContainer}/com.apple.VoiceOver4.local.plist`,
         }),
      );

      expect(
         checks.find((check) => check.id === 'voiceover-local-preferences')?.status,
      ).toBe('pass');
   });

   it('fails when Guidepup ships no bundle for the running macOS version', () => {
      const checks = checkVoiceOverEnvironment(createDeps({ osRelease: '30.0.0' }));
      const bundle = checks.find((check) => check.id === 'voiceover-preferences-bundle');

      expect(bundle?.status).toBe('fail');
      expect(bundle?.detail).toContain('Darwin 30');
      expect(bundle?.action).toBeUndefined();
   });
});

describe('NVDA environment checks', () => {
   it('fails when the Guidepup manifest cannot be resolved', () => {
      const checks = checkNvdaEnvironment(createDeps({ manifestPath: undefined }));

      expect(checks).toEqual([
         expect.objectContaining({ id: 'guidepup-manifest', status: 'fail' }),
      ]);
   });
});
