import { spawn } from 'node:child_process';
import { basename } from 'node:path';

import type { BrowserAutomationCandidate, DriverFocusTarget } from '@a11ied/contracts';

import { createBrowserAutomationPolicy } from './detection.js';

const BROWSER_OPEN_TIMEOUT_MS = 5000;

function resolveBundleId(candidate: BrowserAutomationCandidate): string | undefined {
   const bundleIds: Partial<Record<BrowserAutomationCandidate['id'], string>> = {
      chrome: 'com.google.Chrome',
      msedge: 'com.microsoft.edgemac',
      brave: 'com.brave.Browser',
      chromium: 'org.chromium.Chromium',
   };
   return bundleIds[candidate.id];
}

/** Derives the app-focus target a driver session should use for a browser candidate. */
export function deriveFocusTarget(
   candidate: BrowserAutomationCandidate,
): DriverFocusTarget | undefined {
   const bundleId = resolveBundleId(candidate);
   if (candidate.location) {
      const appName = basename(candidate.location);
      if (appName) {
         if (bundleId) {
            return { appName, bundleId };
         }
         return { appName };
      }
   }

   if (candidate.label) {
      if (bundleId) {
         return { appName: candidate.label, bundleId };
      }
      return { appName: candidate.label };
   }

   return undefined;
}

function selectSystemBrowserCandidate(): BrowserAutomationCandidate | undefined {
   const policy = createBrowserAutomationPolicy();
   return policy.candidates.find((candidate) => candidate.source === 'system');
}

function waitForChildExit(
   child: ReturnType<typeof spawn>,
   timeoutMs: number,
): Promise<void> {
   return new Promise((resolve, reject) => {
      let settled = false;
      let stderr = '';
      if (child.stderr) {
         child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
         });
      }
      const timeout = setTimeout(() => {
         if (settled) {
            return;
         }
         settled = true;
         reject(
            new Error(`Browser open command timed out after ${String(timeoutMs)}ms.`),
         );
      }, timeoutMs);

      child.once('error', (error) => {
         if (settled) {
            return;
         }
         settled = true;
         clearTimeout(timeout);
         reject(error);
      });

      child.once('exit', (code) => {
         if (settled) {
            return;
         }
         settled = true;
         clearTimeout(timeout);
         if (code === 0) {
            resolve();
            return;
         }
         const detail = stderr.trim() ? `: ${stderr.trim()}` : '';
         reject(
            new Error(`Browser open command exited with code ${String(code)}${detail}.`),
         );
      });
   });
}

function escapeAppleScriptString(value: string): string {
   return value.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`);
}

function resolveAppPath(candidate: BrowserAutomationCandidate): string | undefined {
   if (candidate.location) {
      const match = candidate.location.match(/^(.+?\.app)(\/.*)?$/);
      if (match?.[1]) {
         return match[1];
      }
   }
   return undefined;
}

async function openUrlOnMac(
   candidate: BrowserAutomationCandidate,
   url: string,
): Promise<void> {
   const appName = candidate.label || basename(candidate.location ?? '');
   const script = [
      `tell application "${escapeAppleScriptString(appName)}"`,
      'activate',
      'set targetWindow to make new window',
      `set URL of active tab of targetWindow to "${escapeAppleScriptString(url)}"`,
      'end tell',
   ];
   const child = spawn(
      'osascript',
      script.flatMap((line) => ['-e', line]),
      {
         stdio: ['ignore', 'ignore', 'pipe'],
      },
   );
   try {
      await waitForChildExit(child, BROWSER_OPEN_TIMEOUT_MS);
      return;
   } catch {
      // Osascript may fail in headless CI without AppleEvents authorization.
   }

   const bundleId = resolveBundleId(candidate);
   const appPath = resolveAppPath(candidate);
   const fallbackArgs = bundleId
      ? ['-b', bundleId, url]
      : ['-a', appPath ?? appName, url];
   const fallback = spawn('open', fallbackArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
   });
   try {
      await waitForChildExit(fallback, BROWSER_OPEN_TIMEOUT_MS);
      return;
   } catch {
      // Fall back to opening the URL with the system's default browser.
   }

   const systemDefault = spawn('open', [url], {
      stdio: ['ignore', 'ignore', 'pipe'],
   });
   await waitForChildExit(systemDefault, BROWSER_OPEN_TIMEOUT_MS);
}

async function openUrlOnWindows(
   candidate: BrowserAutomationCandidate,
   url: string,
): Promise<void> {
   const args = candidate.location
      ? ['/c', 'start', '', candidate.location, url]
      : ['/c', 'start', '', url];
   const child = spawn('cmd', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
   });
   await waitForChildExit(child, BROWSER_OPEN_TIMEOUT_MS);
}

/** Opens one URL in a real, user-visible window of the system's automation browser. */
export async function openUrlInSystemAutomationBrowser(url: string): Promise<{
   candidate: BrowserAutomationCandidate;
   focusTarget: DriverFocusTarget | undefined;
}> {
   const candidate = selectSystemBrowserCandidate();
   if (!candidate) {
      throw new Error(
         'No system browser candidate is available to open a real browser window.',
      );
   }

   if (process.platform === 'darwin') {
      await openUrlOnMac(candidate, url);
   } else if (process.platform === 'win32') {
      await openUrlOnWindows(candidate, url);
   } else {
      const child = spawn('xdg-open', [url], {
         stdio: 'ignore',
      });
      await waitForChildExit(child, BROWSER_OPEN_TIMEOUT_MS);
   }

   return {
      candidate,
      focusTarget: deriveFocusTarget(candidate),
   };
}
