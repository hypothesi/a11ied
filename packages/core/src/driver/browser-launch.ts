import { spawn } from 'node:child_process';
import { basename } from 'node:path';

import type { BrowserAutomationCandidate, DriverFocusTarget } from '@a11ied/contracts';

import { createBrowserAutomationPolicy } from '../browser/policy.js';
import { openUrlInSystemAutomationBrowser, openUrlOnMac } from '../browser/helper.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

/** A cold browser start on a busy machine, such as a CI runner, can take over 5 seconds. */
const BROWSER_OPEN_TIMEOUT_MS = 15_000;

/** Names people type for --browser, mapped to the policy's candidate ids. */
const BROWSER_ALIASES: Readonly<Record<string, string>> = {
   chrome: 'chrome',
   'google chrome': 'chrome',
   edge: 'msedge',
   msedge: 'msedge',
   'microsoft edge': 'msedge',
   brave: 'brave',
   'brave browser': 'brave',
   chromium: 'chromium',
};

const BUNDLE_IDS: Readonly<Record<string, string>> = {
   chrome: 'com.google.Chrome',
   msedge: 'com.microsoft.edgemac',
   brave: 'com.brave.Browser',
   chromium: 'org.chromium.Chromium',
   safari: 'com.apple.Safari',
   firefox: 'org.mozilla.firefox',
};

export interface BrowserChoice {
   /** The app name to open and to wait for in front. */
   appName: string;
   /** The executable, when a detected candidate provides one. */
   location?: string;
   /** The detected browser candidate, when the name matched one. */
   candidate?: BrowserAutomationCandidate;
   focusTarget: DriverFocusTarget;
}

/**
 * Turns a --browser value into the app to open. A detected candidate wins; any other name
 * is opened as an app of that name, which covers Safari and Firefox.
 */
export function resolveBrowserChoice(
   browser: string,
   candidates: readonly BrowserAutomationCandidate[],
   platform: NodeJS.Platform = process.platform,
): BrowserChoice {
   const wanted = browser.trim().toLowerCase();
   const id = BROWSER_ALIASES[wanted] ?? wanted;
   const candidate = candidates.find(
      (entry) => entry.id === id || entry.label.toLowerCase() === wanted,
   );
   const appName = candidate?.location
      ? basename(candidate.location)
      : (candidate?.label ?? browser.trim());
   // A bundle id is a macOS identity. Elsewhere no window reports one, so it never matches.
   const bundleId = platform === 'darwin' ? BUNDLE_IDS[candidate?.id ?? id] : undefined;
   const focusTarget: DriverFocusTarget = bundleId ? { appName, bundleId } : { appName };
   const choice: BrowserChoice = { appName, focusTarget };
   if (candidate) {
      choice.candidate = candidate;
   }
   if (candidate?.location) {
      choice.location = candidate.location;
   }
   return choice;
}

function waitForExit(child: ReturnType<typeof spawn>, label: string): Promise<void> {
   return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
         rejectPromise(
            new CliEnvironmentError(
               'browser-open-timeout',
               `Opening ${label} did not finish within ${String(BROWSER_OPEN_TIMEOUT_MS)} ms.`,
            ),
         );
      }, BROWSER_OPEN_TIMEOUT_MS);
      child.once('error', (error) => {
         clearTimeout(timer);
         rejectPromise(error);
      });
      child.once('exit', (code) => {
         clearTimeout(timer);
         if (code === 0) {
            resolvePromise();
            return;
         }
         rejectPromise(
            new CliEnvironmentError(
               'browser-open-failed',
               `Opening ${label} exited with code ${String(code)}. Is it installed?`,
               { browser: label },
            ),
         );
      });
   });
}

function spawnOpen(choice: BrowserChoice, url: string): ReturnType<typeof spawn> {
   if (process.platform === 'darwin') {
      return spawn('open', ['-a', choice.appName, url], { stdio: 'ignore' });
   }
   if (process.platform === 'win32') {
      const args = [
         '--no-first-run',
         '--no-default-browser-check',
         '--disable-search-engine-choice-screen',
         url,
      ];
      if (choice.location) {
         const child = spawn(choice.location, args, {
            detached: true,
            stdio: 'ignore',
         });
         child.unref();
         return child;
      }
      return spawn('cmd', ['/c', 'start', '', choice.appName, ...args], {
         stdio: 'ignore',
         windowsHide: true,
      });
   }
   return spawn(choice.location ?? choice.appName, [url], { stdio: 'ignore' });
}

/**
 * Opens the URL in the browser named by --browser, or in the system automation browser
 * when none is named, and returns the window to wait for and refocus.
 */
export async function openUrlInBrowser(
   url: string,
   browser?: string,
): Promise<{ focusTarget: DriverFocusTarget | undefined }> {
   if (!browser) {
      const opened = await openUrlInSystemAutomationBrowser(url);
      return { focusTarget: opened.focusTarget };
   }
   const choice = resolveBrowserChoice(
      browser,
      createBrowserAutomationPolicy().candidates,
   );
   if (process.platform === 'darwin' && choice.candidate) {
      await openUrlOnMac(choice.candidate, url);
      return { focusTarget: choice.focusTarget };
   }
   await waitForExit(spawnOpen(choice, url), choice.appName);
   return { focusTarget: choice.focusTarget };
}
