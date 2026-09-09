import type { DriverCurrentItem, DriverTranscriptEntry } from '@a11ied/contracts';

import type { WantedItem } from './broker-loops.js';
import { delay } from './delay.js';
import { describeMatch, describeWanted } from './screen-reader-payloads.js';
import {
   assertCheckPassed,
   checkCurrentItem,
   checkSpoken,
   checkSpokenInOrder,
   type RetryOptions,
   type SpokenCheck,
   type SpokenMatch,
   type SpokenOptions,
} from './spoken-matchers.js';

/** How long a check keeps looking before it fails, when the caller sets no timeout. */
export const DEFAULT_CHECK_TIMEOUT_MS = 5000;
/** How often a waiting check reads the reader again. */
const CHECK_POLL_MS = 100;

async function checkUntilDeadline(
   run: () => Promise<SpokenCheck>,
   deadline: number,
): Promise<SpokenCheck> {
   const check = await run();
   if (check.pass || Date.now() >= deadline) {
      return check;
   }
   await delay(CHECK_POLL_MS);
   return checkUntilDeadline(run, deadline);
}

/**
 * Runs a check again until it passes or the time runs out, the way Playwright's
 * assertions do, so an announcement or a focus move that lands a moment after the command
 * that caused it still counts. A failure after waiting says how long it waited. A check
 * that must not wait, such as one for an absent phrase, runs once.
 */
export async function checkUntil(
   run: () => Promise<SpokenCheck>,
   options: RetryOptions & { retry: boolean },
): Promise<SpokenCheck> {
   const timeoutMs = options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
   if (!options.retry || timeoutMs === 0) {
      return run();
   }
   const check = await checkUntilDeadline(run, Date.now() + timeoutMs);
   return check.pass
      ? check
      : { ...check, failure: `${check.failure}\nWaited ${String(timeoutMs)} ms.` };
}

type ReadTranscript = () => Promise<DriverTranscriptEntry[]>;

/** `expectSpoken`: waits for the phrase unless the check is for its absence. */
export async function assertSpoken(
   transcript: ReadTranscript,
   match: SpokenMatch,
   options: SpokenOptions,
): Promise<void> {
   const check = await checkUntil(
      async () => checkSpoken(await transcript(), match, options),
      { ...options, retry: options.not !== true },
   );
   assertCheckPassed(check, describeMatch(match));
}

/** `expectSpokenInOrder`: waits for every match to land in order. */
export async function assertSpokenInOrder(
   transcript: ReadTranscript,
   matches: readonly SpokenMatch[],
   options: Pick<SpokenOptions, 'since' | 'timeoutMs'>,
): Promise<void> {
   const check = await checkUntil(
      async () => checkSpokenInOrder(await transcript(), matches, options),
      { ...options, retry: true },
   );
   assertCheckPassed(check, matches.map((match) => describeMatch(match)).join(', then '));
}

/** `expectCursorOn`: waits for the cursor to land on the wanted item. */
export async function assertCursorOn(
   read: () => Promise<DriverCurrentItem>,
   wanted: WantedItem,
   options: RetryOptions,
): Promise<void> {
   const check = await checkUntil(async () => checkCurrentItem(await read(), wanted), {
      ...options,
      retry: true,
   });
   assertCheckPassed(check, describeWanted(wanted));
}
