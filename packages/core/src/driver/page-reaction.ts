import { setTimeout as wait } from 'node:timers/promises';
import { ignoreError } from '@a11ied/guidepup';
import type { Page, Request } from 'playwright';

import { isNavigationError } from './virtual-browser-errors.js';

/** The kinds of request whose answer can change what a reader finds on the page. */
const CONTENT_RESOURCE_TYPES: ReadonlySet<string> = new Set([
   'document',
   'fetch',
   'xhr',
   'script',
   'stylesheet',
]);
/** A hidden tab renders no frames, so the wait for two of them needs its own limit. */
const HIDDEN_TAB_FRAME_LIMIT_MS = 250;

interface ReactionWatch {
   page: Page;
   /** Every content request the page has started since the watch began, in order. */
   started: Request[];
   deadline: number;
}

/**
 * Gives the page two rendering passes, which is when it applies what a response brought.
 * Returns false when the document was replaced meanwhile.
 */
async function renderFrames(page: Page): Promise<boolean> {
   try {
      await page.evaluate(
         (limitMs) =>
            new Promise<void>((done) => {
               setTimeout(done, limitMs);
               requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                     done();
                  });
               });
            }),
         HIDDEN_TAB_FRAME_LIMIT_MS,
      );
      return true;
   } catch (error) {
      if (isNavigationError(error)) {
         return false;
      }
      throw error;
   }
}

async function waitForAnswers(requests: readonly Request[]): Promise<void> {
   await Promise.all(
      requests.map(async (request) => {
         const response = await request.response();
         await response?.finished();
      }),
   ).catch(ignoreError);
}

/** Repeats until a rendering pass starts no new request, or the deadline passes. */
async function settle(watch: ReactionWatch, handled = 0): Promise<void> {
   const rendered = await renderFrames(watch.page);
   const fresh = watch.started.slice(handled),
      remainingMs = watch.deadline - Date.now();
   if (!rendered || fresh.length === 0 || remainingMs <= 0) {
      return;
   }
   // An unreferenced timer, so the deadline cannot keep the process alive after the answers.
   await Promise.race([
      waitForAnswers(fresh),
      wait(remainingMs, undefined, { ref: false }),
   ]);
   return settle(watch, handled + fresh.length);
}

/**
 * Runs an input action, then waits for the page to finish reacting to it. A client-side
 * router answers a click by fetching the next view and swapping it into the same
 * document, so the click returns long before the new content exists. The wait ends when
 * the requests the action started are answered and rendered, or `timeoutMs` after the
 * action began.
 */
export async function withPageReaction<TResult>(
   page: Page,
   timeoutMs: number,
   action: () => Promise<TResult>,
): Promise<TResult> {
   const started: Request[] = [];
   function recordRequest(request: Request): void {
      if (CONTENT_RESOURCE_TYPES.has(request.resourceType())) {
         started.push(request);
      }
   }
   const deadline = Date.now() + timeoutMs;
   page.on('request', recordRequest);
   try {
      const result = await action();
      await settle({ page, started, deadline });
      return result;
   } finally {
      page.off('request', recordRequest);
   }
}
