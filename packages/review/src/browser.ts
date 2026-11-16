import type {
   StartReviewInput,
   StartReviewResult,
   RunReviewInput,
   RunReviewResult,
   ObserveReviewInput,
   ObserveReviewResult,
} from './types.js';
import { review, readReviewRunState } from './facade.js';
import { CliUsageError, matchScopeExclusion } from '@a11ied/verdict';
import type { Browser } from 'playwright';
import { launchAutomationBrowser } from '@a11ied/core';

async function withReviewBrowser<TResult>(
   operation: (browser: Browser) => Promise<TResult>,
): Promise<TResult> {
   const { browser } = await launchAutomationBrowser();
   try {
      return await operation(browser);
   } finally {
      await browser.close();
   }
}

function needsBrowser(input: StartReviewInput): boolean {
   if (input.browser || input.observeTarget) {
      return false;
   }
   if (!input.states?.length) {
      return true;
   }
   return input.states.some(
      (state) =>
         !state.bundle &&
         !state.excluded &&
         !matchScopeExclusion(state, input.exclusions ?? []),
   );
}

export async function startBrowserReview(
   input: StartReviewInput,
): Promise<StartReviewResult> {
   if (!needsBrowser(input)) {
      return review.start(input);
   }
   return withReviewBrowser(async (browser) => review.start({ ...input, browser }));
}

export async function runBrowserReview(input: RunReviewInput): Promise<RunReviewResult> {
   if (!needsBrowser(input)) {
      return review.run(input);
   }
   return withReviewBrowser(async (browser) => review.run({ ...input, browser }));
}

export async function observeBrowserReview(
   input: ObserveReviewInput & { refresh?: boolean | undefined },
): Promise<ObserveReviewResult> {
   if (input.capture && input.refresh) {
      throw new CliUsageError(
         'capture-input-invalid',
         'Capture and refresh cannot be combined.',
      );
   }
   if (input.browser || (!input.refresh && input.setup === undefined && !input.capture)) {
      return review.observe(input);
   }
   const run = await readReviewRunState(input.runDir);
   const state = run.states.find((item) => item.stateId === input.stateId);
   if (state?.excluded || (state && matchScopeExclusion(state, run.exclusions))) {
      throw new CliUsageError('state-excluded', 'Excluded states cannot be observed.');
   }
   return withReviewBrowser(async (browser) => review.observe({ ...input, browser }));
}

export const browserReview = {
   start: startBrowserReview,
   run: runBrowserReview,
   observe: observeBrowserReview,
};
