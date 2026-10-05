import type { BrowserAutomationPolicy } from '@a11ied/contracts';
import type { GuidepupEnvironmentDeps } from '@a11ied/guidepup';
import type { DoctorDeps } from './runtime.js';

const HOME = '/Users/tester';
const INSTALL_ROOT = '/repo';
const MANIFEST_PATH = `${INSTALL_ROOT}/node_modules/@guidepup/guidepup/manifest.json`;
export const INSTALL_COMMAND = 'a1 setup';
export const SETUP_COMMAND = 'a1 setup';
export const APPLESCRIPT_FLAG =
   '/private/var/db/Accessibility/.VoiceOverAppleScriptEnabled';
export const LOCAL_PREFERENCES = `${HOME}/Library/Preferences/com.apple.VoiceOver4.local.plist`;
const PREFERENCES_BUNDLE = `${HOME}/Library/Caches/guidepup/voiceover/25/0.0.1-VoiceOver4/guidepup-voiceover-preferences-macos-26.dmg`;
export const NVDA_EXECUTABLE = '/cache/nvda/all/0.2.1-2026.1.1/extracted/nvda.exe';
export const READY_DARWIN_PATHS: string[] = [
   APPLESCRIPT_FLAG,
   LOCAL_PREFERENCES,
   PREFERENCES_BUNDLE,
];
export const APPLESCRIPT_DEFAULT = 'com.apple.VoiceOver4/default:SCREnableAppleScript';
export const ENABLED_DEFAULTS: Record<string, string> = {
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

/** Inject OS queries so tests cannot capture the desktop or read user settings. */
export function createDeps(args: {
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
