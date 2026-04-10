import type { Browser } from 'playwright';
import { expect, it, vi } from 'vitest';

import {
   type BrowserRuntimeDeps,
   createBrowserAutomationPolicy,
   launchAutomationBrowser,
   PLAYWRIGHT_INSTALL_CHROMIUM_COMMAND,
} from './policy.js';

function createBrowserStub(): Browser {
   return {
      close: async () => {
         const marker = Date.now();
         if (marker < 0) {
            throw new Error('unreachable');
         }
      },
   } as unknown as Browser;
}

function createDeps(args: {
   platform?: NodeJS.Platform;
   existingPaths?: string[];
   lookup?: Record<string, string | undefined>;
   playwrightExecutablePath?: string | undefined;
   launchImpl?: (options: {
      channel?: string;
      executablePath?: string;
      headless?: boolean;
   }) => Promise<Browser>;
}): BrowserRuntimeDeps {
   let existing = new Set<string>();
   if (args.existingPaths) {
      existing = new Set(args.existingPaths);
   }
   const lookup = args.lookup ?? {};

   return {
      env: {
         LOCALAPPDATA: 'C:/Users/test/AppData/Local',
         PROGRAMFILES: 'C:/Program Files',
         'PROGRAMFILES(X86)': 'C:/Program Files (x86)',
      },
      existsSync: (path: string): boolean => existing.has(path),
      homeDir: '/Users/test',
      lookupPath: (names: readonly string[]): string | undefined => {
         const foundName = names.find((name) => lookup[name]);
         if (foundName) {
            return lookup[foundName];
         }
      },
      platform: args.platform ?? 'darwin',
      playwrightExecutablePath: (): string | undefined => args.playwrightExecutablePath,
      launch: args.launchImpl ?? vi.fn(async (): Promise<Browser> => createBrowserStub()),
   };
}

it('prefers installed Chrome before Playwright Chromium', () => {
   const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
   const bundledPath = '/Users/test/Library/Caches/ms-playwright/chromium-1234/chrome';
   const policy = createBrowserAutomationPolicy(
      createDeps({
         existingPaths: [chromePath, bundledPath],
         playwrightExecutablePath: bundledPath,
      }),
   );

   expect(policy.policyName).toBe('system-browser-first');
   expect(policy.installCommand).toBe(PLAYWRIGHT_INSTALL_CHROMIUM_COMMAND);
   expect(policy.preferredCandidate?.id).toBe('chrome');
   expect(policy.candidates.map((candidate) => candidate.id)).toEqual([
      'chrome',
      'playwright-chromium',
   ]);
});

it('falls back to Playwright Chromium when no system browser is present', () => {
   const bundledPath = '/Users/test/Library/Caches/ms-playwright/chromium-1234/chrome';
   const policy = createBrowserAutomationPolicy(
      createDeps({
         existingPaths: [bundledPath],
         playwrightExecutablePath: bundledPath,
      }),
   );

   expect(policy.preferredCandidate?.id).toBe('playwright-chromium');
   expect(policy.candidates).toHaveLength(1);
});

it('launches the first working candidate in order', async () => {
   const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
   const chromiumPath = '/Applications/Chromium.app/Contents/MacOS/Chromium';
   const launchCalls: Array<{
      channel?: string;
      executablePath?: string;
      headless?: boolean;
   }> = [];
   const result = await launchAutomationBrowser(
      createDeps({
         existingPaths: [chromePath, chromiumPath],
         launchImpl: async (options): Promise<Browser> => {
            launchCalls.push(options);
            if (options.channel === 'chrome') {
               throw new Error('chrome launch failed');
            }
            return createBrowserStub();
         },
      }),
   );

   expect(result.candidate.id).toBe('chromium');
   expect(launchCalls).toEqual([
      {
         channel: 'chrome',
         headless: true,
      },
      {
         executablePath: chromiumPath,
         headless: true,
      },
   ]);
});

it('fails with the install command when no browser is available', async () => {
   await expect(
      launchAutomationBrowser(
         createDeps({
            existingPaths: [],
         }),
      ),
   ).rejects.toMatchObject({
      code: 'browser-unavailable',
      details: expect.objectContaining({
         installCommand: PLAYWRIGHT_INSTALL_CHROMIUM_COMMAND,
      }),
   });
});
