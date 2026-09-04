import { describe, expect, it } from 'vitest';

import type { BrowserAutomationPolicy } from '@a11ied/contracts';
import type { GuidepupEnvironmentDeps } from '@a11ied/guidepup';

import {
   createDoctorReport,
   listCliCommands,
   listSupportedTargets,
   renderDoctorText,
   type DoctorDeps,
} from './index.js';
import { expectReadyCommands } from './release-test-helpers.js';

const EXPECTED_TARGET_COUNT = 3;
const VOICEOVER_TARGET_INDEX = 0;
const NVDA_TARGET_INDEX = 1;
const VIRTUAL_TARGET_INDEX = 2;
const HOME = '/Users/tester';
const INSTALL_ROOT = '/repo';
const MANIFEST_PATH = `${INSTALL_ROOT}/node_modules/@guidepup/guidepup/manifest.json`;
const INSTALL_COMMAND = `cd "${INSTALL_ROOT}" && npx -y @guidepup/setup install`;
const SETUP_COMMAND = 'npx -y @guidepup/setup setup';
const APPLESCRIPT_FLAG = '/private/var/db/Accessibility/.VoiceOverAppleScriptEnabled';
const LOCAL_PREFERENCES = `${HOME}/Library/Preferences/com.apple.VoiceOver4.local.plist`;
const PREFERENCES_BUNDLE = `${HOME}/Library/Caches/guidepup/voiceover/25/0.0.1-VoiceOver4/guidepup-voiceover-preferences-macos-26.dmg`;
const NVDA_EXECUTABLE = '/cache/nvda/all/0.2.1-2026.1.1/extracted/nvda.exe';
const READY_DARWIN_PATHS = [APPLESCRIPT_FLAG, LOCAL_PREFERENCES, PREFERENCES_BUNDLE];
const APPLESCRIPT_DEFAULT = 'com.apple.VoiceOver4/default:SCREnableAppleScript';
const ENABLED_DEFAULTS = {
   [APPLESCRIPT_DEFAULT]: '1',
   'com.apple.VoiceOverTraining:doNotShowSplashScreen': '1',
};

const manifest = {
   screenReaders: [
      { id: 'nvda', assets: [{ version: '0.2.1-2026.1.1', asset: 'guidepup-nvda.zip' }] },
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
};

const chrome = {
   id: 'chrome',
   label: 'Google Chrome',
   source: 'system',
   launchMode: 'channel',
   location: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
} as const;

function createBrowserPolicy(detected: boolean): BrowserAutomationPolicy {
   return {
      policyName: 'system-browser-first',
      installCommand: 'npx playwright install chromium',
      preferredCandidate: detected ? chrome : undefined,
      candidates: detected ? [chrome] : [],
   };
}

function createGuidepupDeps(args: {
   platform: NodeJS.Platform;
   existingPaths: string[];
   defaults?: Record<string, string>;
}): GuidepupEnvironmentDeps {
   const defaults = args.defaults ?? {};
   return {
      platform: args.platform,
      osRelease: '25.5.0',
      homeDir: HOME,
      env: args.platform === 'win32' ? { GUIDEPUP_SCREEN_READERS_PATH: '/cache' } : {},
      existsSync: (path) => args.existingPaths.includes(path),
      readDefault: (domain, key) => defaults[`${domain}:${key}`],
      manifestPath: MANIFEST_PATH,
      readManifest: () => manifest,
   };
}

function createDeps(args: {
   platform: NodeJS.Platform;
   existingPaths?: string[];
   defaults?: Record<string, string>;
   browserDetected?: boolean;
}): DoctorDeps {
   return {
      platform: args.platform,
      guidepup: createGuidepupDeps({
         platform: args.platform,
         existingPaths: args.existingPaths ?? [],
         ...(args.defaults ? { defaults: args.defaults } : {}),
      }),
      browserAutomation: () => createBrowserPolicy(args.browserDetected ?? true),
      probeScreenRecording: () => ({
         id: 'screen-recording',
         label: 'Screen recording available',
         status: 'pass',
      }),
      npmVersion: () => '11.0.0',
      osVersion: () => '26.0',
   };
}

describe('core scaffolding', () => {
   it('returns the supported target matrix', () => {
      const targets = listSupportedTargets();

      expect(targets).toHaveLength(EXPECTED_TARGET_COUNT);
      expect(targets.map((target) => target.platform)).toEqual([
         'voiceover',
         'nvda',
         'virtual',
      ]);
      expect(
         targets[VOICEOVER_TARGET_INDEX]?.notes.some((note: string) =>
            note.includes(SETUP_COMMAND),
         ),
      ).toBe(true);
   });

   it('returns only shipped ready command families in the CLI catalog data', () => {
      expectReadyCommands(listCliCommands());
   });
});

describe('doctor report on macOS', () => {
   it('reports a ready host when every VoiceOver check passes', () => {
      const report = createDoctorReport(
         createDeps({
            platform: 'darwin',
            existingPaths: READY_DARWIN_PATHS,
            defaults: ENABLED_DEFAULTS,
         }),
      );
      const statuses = report.targets.map((target) => target.status);
      const checks = report.targets[VOICEOVER_TARGET_INDEX]?.checks ?? [];

      expect(report.ready).toBe(true);
      expect(report.actions).toEqual([]);
      expect(report.host).toEqual({
         platform: 'darwin',
         osName: 'macOS',
         release: '26.0',
         arch: process.arch,
      });
      expect(statuses).toEqual(['ready', 'unsupported', 'ready']);
      expect(checks.every((check) => check.status === 'pass')).toBe(true);
      expect(renderDoctorText(report)).toContain('✓ Ready for a1 commands on macOS 26.0');
   });

   it('lists the install step when the VoiceOver preferences bundle is missing', () => {
      const report = createDoctorReport(
         createDeps({
            platform: 'darwin',
            existingPaths: [APPLESCRIPT_FLAG, LOCAL_PREFERENCES],
            defaults: ENABLED_DEFAULTS,
         }),
      );
      const text = renderDoctorText(report);

      expect(report.ready).toBe(false);
      expect(report.actions).toEqual([
         {
            label: 'Install the Guidepup VoiceOver preferences bundle',
            command: INSTALL_COMMAND,
            required: true,
         },
      ]);
      expect(report.targets[VOICEOVER_TARGET_INDEX]?.status).toBe('requires-setup');
      expect(text).toContain('✗ 1 setup step needed');
      expect(text).toContain('Action items');
      expect(text).toContain(INSTALL_COMMAND);
      expect(text).toContain('- windows-nvda     Only available on Windows.');
   });
});

describe('doctor report optional steps', () => {
   it('treats the welcome dialog setting as an optional step', () => {
      const report = createDoctorReport(
         createDeps({
            platform: 'darwin',
            existingPaths: READY_DARWIN_PATHS,
            defaults: { [APPLESCRIPT_DEFAULT]: '1' },
         }),
      );

      expect(report.ready).toBe(true);
      expect(report.targets[VOICEOVER_TARGET_INDEX]?.status).toBe('ready');
      expect(report.actions).toEqual([
         {
            label: 'Suppress the VoiceOver welcome dialog',
            command: SETUP_COMMAND,
            required: false,
         },
      ]);
      expect(renderDoctorText(report)).toContain('(optional)');
   });
});

describe('doctor report on other hosts', () => {
   it('checks the Guidepup NVDA build on Windows', () => {
      const missing = createDoctorReport(createDeps({ platform: 'win32' }));
      const installed = createDoctorReport(
         createDeps({ platform: 'win32', existingPaths: [NVDA_EXECUTABLE] }),
      );

      expect(missing.host.osName).toBe('Windows');
      expect(missing.targets[VOICEOVER_TARGET_INDEX]?.status).toBe('unsupported');
      expect(missing.targets[NVDA_TARGET_INDEX]?.status).toBe('requires-setup');
      expect(missing.actions).toEqual([
         {
            label: 'Install the Guidepup NVDA build',
            command: INSTALL_COMMAND,
            required: true,
         },
      ]);
      expect(installed.targets[NVDA_TARGET_INDEX]?.status).toBe('ready');
      expect(installed.ready).toBe(true);
   });

   it('flags a missing browser as a required action', () => {
      const report = createDoctorReport(
         createDeps({ platform: 'linux', browserDetected: false }),
      );

      expect(report.ready).toBe(false);
      expect(report.targets.map((target) => target.status)).toEqual([
         'unsupported',
         'unsupported',
         'ready',
      ]);
      expect(report.targets[VIRTUAL_TARGET_INDEX]?.summary).toBe('No setup needed.');
      expect(report.actions).toEqual([
         {
            label: 'Install a Chromium browser for axe scans',
            command: 'npx playwright install chromium',
            required: true,
         },
      ]);
      expect(renderDoctorText(report)).toContain('✗ No Chromium-family browser found');
   });
});
