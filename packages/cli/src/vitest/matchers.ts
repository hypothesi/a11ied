import type { DriverCurrentItem, DriverTranscriptEntry } from '@a11ied/contracts';

import type { WantedItem } from '../../../core/src/driver/broker-loops.js';
import type { QueuedScreenReader } from '../../../core/src/driver/queued-screen-reader.js';
import type { ScreenReader } from '../../../core/src/driver/screen-reader.js';
import {
   checkCurrentItem,
   checkSpoken,
   checkSpokenInOrder,
   type SpokenCheck,
   type SpokenMatch,
   type SpokenOptions,
} from '../../../core/src/driver/spoken-matchers.js';

/** A reader of either kind. The matchers only call `transcript` and `read` on it. */
type AnyScreenReader = ScreenReader | QueuedScreenReader;

/** What the spoken matchers accept: a reader, its transcript entries, or bare phrases. */
export type SpokenReceived =
   | AnyScreenReader
   | readonly DriverTranscriptEntry[]
   | readonly string[];

/** What `toHaveCursorOn` accepts: a reader, or an item `sr.read()` returned. */
export type ItemReceived = AnyScreenReader | DriverCurrentItem;

/** The shape Vitest's `expect.extend` takes back from a matcher. */
export interface MatcherOutcome {
   pass: boolean;
   message: () => string;
}

/**
 * A structural check rather than `instanceof`, because the class can be bundled twice:
 * once in `a11ied/vitest` and once in `a11ied/test`. A queued reader passes it too.
 */
export function isScreenReader(value: unknown): value is AnyScreenReader {
   return (
      typeof value === 'object' &&
      value !== null &&
      'transcript' in value &&
      'read' in value &&
      'expectSpoken' in value
   );
}

function isPhraseList(
   value: readonly DriverTranscriptEntry[] | readonly string[],
): value is readonly string[] {
   return value.every((entry) => typeof entry === 'string');
}

function toEntries(
   received: readonly DriverTranscriptEntry[] | readonly string[],
): DriverTranscriptEntry[] {
   if (!isPhraseList(received)) {
      return [...received];
   }
   const at = new Date().toISOString();
   return received.map((phrase, index) => ({ index, at, phrase }));
}

async function resolveEntries(
   received: SpokenReceived,
): Promise<DriverTranscriptEntry[]> {
   return isScreenReader(received)
      ? Promise.resolve(received.transcript())
      : toEntries(received);
}

function toOutcome(check: SpokenCheck): MatcherOutcome {
   return {
      pass: check.pass,
      message: () => (check.pass ? check.negatedFailure : check.failure),
   };
}

/**
 * The matchers `expect.extend` installs: `toHaveSpoken`, `toHaveSpokenInOrder`, and
 * `toHaveCursorOn`. Given a reader they read its transcript first, so they return a
 * promise and must be awaited; given entries, phrases, or an item they answer at once.
 */
export const screenReaderMatchers = {
   toHaveSpoken(
      received: SpokenReceived,
      match: SpokenMatch,
      options: SpokenOptions = {},
   ): MatcherOutcome | Promise<MatcherOutcome> {
      if (isScreenReader(received)) {
         return Promise.resolve(received.transcript()).then((entries) =>
            toOutcome(checkSpoken(entries, match, options)),
         );
      }
      return toOutcome(checkSpoken(toEntries(received), match, options));
   },
   toHaveSpokenInOrder(
      received: SpokenReceived,
      matches: readonly SpokenMatch[],
      options: Pick<SpokenOptions, 'since'> = {},
   ): MatcherOutcome | Promise<MatcherOutcome> {
      if (isScreenReader(received)) {
         return resolveEntries(received).then((entries) =>
            toOutcome(checkSpokenInOrder(entries, matches, options)),
         );
      }
      return toOutcome(checkSpokenInOrder(toEntries(received), matches, options));
   },
   toHaveCursorOn(
      received: ItemReceived,
      wanted: WantedItem,
   ): MatcherOutcome | Promise<MatcherOutcome> {
      if (isScreenReader(received)) {
         return Promise.resolve(received.read()).then((item) =>
            toOutcome(checkCurrentItem(item, wanted)),
         );
      }
      return toOutcome(checkCurrentItem(received, wanted));
   },
};
