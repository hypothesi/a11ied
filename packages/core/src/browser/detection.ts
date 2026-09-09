import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright';

import type {
   BrowserAutomationCandidate,
   BrowserAutomationPolicy,
} from '@a11ied/contracts';

const { env: processEnv, platform: processPlatform } = process;

type BrowserPathLookup = readonly string[];

export interface BrowserLaunchOptions {
   args?: string[];
   channel?: 'chrome' | 'msedge';
   executablePath?: string;
   headless: boolean;
}

export interface BrowserLaunchPreference {
   headless?: boolean;
}

export interface BrowserPolicyDeps {
   env: NodeJS.ProcessEnv;
   existsSync: (path: string) => boolean;
   homeDir: string;
   lookupPath: (names: BrowserPathLookup) => string | undefined;
   platform: NodeJS.Platform;
   playwrightExecutablePath: () => string | undefined;
}

import { browserDefinitions } from './locations.js';

const BROWSER_POLICY_NAME = 'system-browser-first';
export const PLAYWRIGHT_INSTALL_CHROMIUM_COMMAND = 'npx playwright install chromium';

function splitLookupOutput(stdout: string): string[] {
   return stdout
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
}

function getLookupBinary(platform: NodeJS.Platform): 'where' | 'which' {
   if (platform === 'win32') {
      return 'where';
   }

   return 'which';
}

function lookupCommandPath(
   command: string,
   platform: NodeJS.Platform,
): string | undefined {
   const result = spawnSync(getLookupBinary(platform), [command], {
      encoding: 'utf8',
   });
   if (result.status !== 0) {
      return undefined;
   }

   return splitLookupOutput(result.stdout)[0];
}

function lookupFirstOnPath(
   names: BrowserPathLookup,
   platform: NodeJS.Platform,
): string | undefined {
   for (const name of names) {
      const resolved = lookupCommandPath(name, platform);
      if (resolved) {
         return resolved;
      }
   }

   return undefined;
}

export function createDefaultBrowserPolicyDeps(): BrowserPolicyDeps {
   return {
      env: processEnv,
      existsSync,
      homeDir: homedir(),
      lookupPath: (names) => lookupFirstOnPath(names, processPlatform),
      platform: processPlatform,
      playwrightExecutablePath: () => {
         let executablePath = '';
         try {
            executablePath = chromium.executablePath();
         } catch {
            executablePath = '';
         }
         if (executablePath.length > 0) {
            return executablePath;
         }
      },
   };
}

function toCandidate(
   definition: (typeof browserDefinitions)[number],
   location: string | undefined,
): BrowserAutomationCandidate | undefined {
   if (!location) {
      return;
   }

   return {
      id: definition.id,
      label: definition.label,
      source: definition.source,
      launchMode: definition.launchMode,
      location,
   };
}

function detectBrowserAutomationCandidates(
   deps: BrowserPolicyDeps = createDefaultBrowserPolicyDeps(),
): BrowserAutomationCandidate[] {
   const candidates: BrowserAutomationCandidate[] = [];

   for (const definition of browserDefinitions) {
      const candidate = toCandidate(definition, definition.resolveLocation(deps));
      if (candidate) {
         candidates.push(candidate);
      }
   }

   return candidates;
}

export function createBrowserAutomationPolicy(
   deps: BrowserPolicyDeps = createDefaultBrowserPolicyDeps(),
): BrowserAutomationPolicy {
   const candidates = detectBrowserAutomationCandidates(deps);

   return {
      policyName: BROWSER_POLICY_NAME,
      installCommand: PLAYWRIGHT_INSTALL_CHROMIUM_COMMAND,
      preferredCandidate: candidates[0],
      candidates,
   };
}

export function getBrowserLaunchOptions(
   candidate: BrowserAutomationCandidate,
   preference?: BrowserLaunchPreference,
): BrowserLaunchOptions {
   const headless = preference?.headless ?? true;
   const definition = browserDefinitions.find((entry) => entry.id === candidate.id);
   if (!definition) {
      return {
         headless,
      };
   }

   return {
      ...definition.toLaunchOptions(candidate.location),
      headless,
   };
}
