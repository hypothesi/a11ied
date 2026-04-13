import { chromium, type Browser } from 'playwright';

import type {
   BrowserAutomationCandidate,
   BrowserAutomationPolicy,
} from '@a11ied/contracts';

import { CliEnvironmentError } from '../errors/cli-errors.js';
import {
   createBrowserAutomationPolicy,
   createDefaultBrowserPolicyDeps,
   getBrowserLaunchOptions,
   PLAYWRIGHT_INSTALL_CHROMIUM_COMMAND,
   type BrowserLaunchPreference,
   type BrowserPolicyDeps,
   type BrowserLaunchOptions,
} from './detection.js';

export interface BrowserRuntimeDeps extends BrowserPolicyDeps {
   launch: (options: BrowserLaunchOptions) => Promise<Browser>;
}

interface BrowserLaunchAttemptFailure {
   candidateId: BrowserAutomationCandidate['id'];
   message: string;
}

interface BrowserLaunchResult {
   browser: Browser;
   candidate: BrowserAutomationCandidate;
   policy: BrowserAutomationPolicy;
}

function createDefaultBrowserRuntimeDeps(): BrowserRuntimeDeps {
   return {
      ...createDefaultBrowserPolicyDeps(),
      launch: async (options) => chromium.launch(options),
   };
}

function toFailure(
   candidateId: BrowserAutomationCandidate['id'],
   error: unknown,
): BrowserLaunchAttemptFailure {
   if (error instanceof Error) {
      return {
         candidateId,
         message: error.message,
      };
   }

   return {
      candidateId,
      message: String(error),
   };
}

function createNoBrowserError(args: {
   failures: BrowserLaunchAttemptFailure[];
   policy: BrowserAutomationPolicy;
}): CliEnvironmentError {
   const details: Record<string, unknown> = {
      browserPolicy: args.policy.policyName,
      installCommand: PLAYWRIGHT_INSTALL_CHROMIUM_COMMAND,
      candidates: args.policy.candidates,
   };

   if (args.failures.length > 0) {
      details.failures = args.failures;
   }

   return new CliEnvironmentError(
      'browser-unavailable',
      'No usable Chromium-family browser is available for Playwright automation.',
      details,
   );
}

async function launchCandidateChain(args: {
   candidates: BrowserAutomationCandidate[];
   deps: BrowserRuntimeDeps;
   failures: BrowserLaunchAttemptFailure[];
   policy: BrowserAutomationPolicy;
   preference: BrowserLaunchPreference | undefined;
}): Promise<BrowserLaunchResult> {
   const [candidate, ...remaining] = args.candidates;
   if (!candidate) {
      throw createNoBrowserError({
         failures: args.failures,
         policy: args.policy,
      });
   }

   try {
      const browser = await args.deps.launch(
         getBrowserLaunchOptions(candidate, args.preference),
      );
      return {
         browser,
         candidate,
         policy: args.policy,
      };
   } catch (error) {
      return launchCandidateChain({
         candidates: remaining,
         deps: args.deps,
         failures: [...args.failures, toFailure(candidate.id, error)],
         policy: args.policy,
         preference: args.preference,
      });
   }
}

export async function launchAutomationBrowser(
   deps: BrowserRuntimeDeps = createDefaultBrowserRuntimeDeps(),
   preference?: BrowserLaunchPreference,
): Promise<BrowserLaunchResult> {
   const policy = createBrowserAutomationPolicy(deps);

   return launchCandidateChain({
      candidates: policy.candidates,
      deps,
      failures: [],
      policy,
      preference,
   });
}
