import { join } from 'node:path';

import type { BrowserAutomationCandidate } from '@a11ied/contracts';

import type { BrowserLaunchOptions, BrowserPolicyDeps } from './detection.js';

type BrowserId = 'chrome' | 'msedge' | 'brave' | 'chromium' | 'playwright-chromium';

interface BrowserLaunchCandidateDefinition {
   id: BrowserId;
   label: string;
   launchMode: BrowserAutomationCandidate['launchMode'];
   source: BrowserAutomationCandidate['source'];
   resolveLocation: (deps: BrowserPolicyDeps) => string | undefined;
   toLaunchOptions: (location: string | undefined) => BrowserLaunchOptions;
}

function isNonEmpty(value: string | undefined): value is string {
   return typeof value === 'string' && value.trim().length > 0;
}

function firstExistingPath(
   deps: BrowserPolicyDeps,
   paths: readonly (string | undefined)[],
): string | undefined {
   for (const path of paths) {
      if (isNonEmpty(path) && deps.existsSync(path)) {
         return path;
      }
   }
}

function resolveChromeLocation(deps: BrowserPolicyDeps): string | undefined {
   if (deps.platform === 'darwin') {
      return firstExistingPath(deps, [
         '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
         join(
            deps.homeDir,
            'Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
         ),
      ]);
   }

   if (deps.platform === 'win32') {
      return firstExistingPath(deps, [
         join(deps.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
         join(deps.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
         join(
            deps.env['PROGRAMFILES(X86)'] ?? '',
            'Google/Chrome/Application/chrome.exe',
         ),
         deps.lookupPath(['chrome', 'chrome.exe', 'google-chrome']),
      ]);
   }

   return firstExistingPath(deps, [
      deps.lookupPath(['google-chrome-stable', 'google-chrome', 'chrome']),
   ]);
}

function resolveEdgeLocation(deps: BrowserPolicyDeps): string | undefined {
   if (deps.platform === 'darwin') {
      return firstExistingPath(deps, [
         '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
         join(
            deps.homeDir,
            'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
         ),
      ]);
   }

   if (deps.platform === 'win32') {
      return firstExistingPath(deps, [
         join(deps.env.LOCALAPPDATA ?? '', 'Microsoft/Edge/Application/msedge.exe'),
         join(deps.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
         join(
            deps.env['PROGRAMFILES(X86)'] ?? '',
            'Microsoft/Edge/Application/msedge.exe',
         ),
         deps.lookupPath(['msedge', 'msedge.exe', 'microsoft-edge']),
      ]);
   }

   return firstExistingPath(deps, [
      deps.lookupPath(['microsoft-edge-stable', 'microsoft-edge', 'msedge']),
   ]);
}

function resolveBraveLocation(deps: BrowserPolicyDeps): string | undefined {
   if (deps.platform === 'darwin') {
      return firstExistingPath(deps, [
         '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
         join(
            deps.homeDir,
            'Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
         ),
      ]);
   }

   if (deps.platform === 'win32') {
      return firstExistingPath(deps, [
         join(
            deps.env.LOCALAPPDATA ?? '',
            'BraveSoftware/Brave-Browser/Application/brave.exe',
         ),
         join(
            deps.env.PROGRAMFILES ?? '',
            'BraveSoftware/Brave-Browser/Application/brave.exe',
         ),
         join(
            deps.env['PROGRAMFILES(X86)'] ?? '',
            'BraveSoftware/Brave-Browser/Application/brave.exe',
         ),
         deps.lookupPath(['brave', 'brave.exe']),
      ]);
   }

   return firstExistingPath(deps, [deps.lookupPath(['brave-browser', 'brave'])]);
}

function resolveChromiumLocation(deps: BrowserPolicyDeps): string | undefined {
   if (deps.platform === 'darwin') {
      return firstExistingPath(deps, [
         '/Applications/Chromium.app/Contents/MacOS/Chromium',
         join(deps.homeDir, 'Applications/Chromium.app/Contents/MacOS/Chromium'),
      ]);
   }

   if (deps.platform === 'win32') {
      return firstExistingPath(deps, [
         join(deps.env.LOCALAPPDATA ?? '', 'Chromium/Application/chrome.exe'),
         join(deps.env.PROGRAMFILES ?? '', 'Chromium/Application/chrome.exe'),
         join(deps.env['PROGRAMFILES(X86)'] ?? '', 'Chromium/Application/chrome.exe'),
         deps.lookupPath(['chromium', 'chromium.exe']),
      ]);
   }

   return firstExistingPath(deps, [deps.lookupPath(['chromium-browser', 'chromium'])]);
}

function resolvePlaywrightChromiumLocation(deps: BrowserPolicyDeps): string | undefined {
   const path = deps.playwrightExecutablePath();
   if (!isNonEmpty(path)) {
      return;
   }

   if (!deps.existsSync(path)) {
      return;
   }

   return path;
}

export const browserDefinitions: readonly BrowserLaunchCandidateDefinition[] = [
   {
      id: 'chrome',
      label: 'Google Chrome',
      launchMode: 'channel',
      source: 'system',
      resolveLocation: resolveChromeLocation,
      toLaunchOptions: () => ({
         channel: 'chrome',
         headless: true,
      }),
   },
   {
      id: 'msedge',
      label: 'Microsoft Edge',
      launchMode: 'channel',
      source: 'system',
      resolveLocation: resolveEdgeLocation,
      toLaunchOptions: () => ({
         channel: 'msedge',
         headless: true,
      }),
   },
   {
      id: 'brave',
      label: 'Brave Browser',
      launchMode: 'executable-path',
      source: 'system',
      resolveLocation: resolveBraveLocation,
      toLaunchOptions: (location) => {
         if (location) {
            return {
               executablePath: location,
               headless: true,
            };
         }
         return {
            headless: true,
         };
      },
   },
   {
      id: 'chromium',
      label: 'Chromium',
      launchMode: 'executable-path',
      source: 'system',
      resolveLocation: resolveChromiumLocation,
      toLaunchOptions: (location) => {
         if (location) {
            return {
               executablePath: location,
               headless: true,
            };
         }
         return {
            headless: true,
         };
      },
   },
   {
      id: 'playwright-chromium',
      label: 'Playwright Chromium',
      launchMode: 'playwright-bundled',
      source: 'playwright',
      resolveLocation: resolvePlaywrightChromiumLocation,
      toLaunchOptions: () => ({
         headless: true,
      }),
   },
] as const;
