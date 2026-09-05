import type { DriverTranscriptEntry } from '@a11ied/contracts';

import { describeMatcher, matchesText, type TextMatcher } from './matcher.js';
import { selectTranscriptEntries } from './transcript.js';

export interface ExpectationOptions {
   matcher: TextMatcher;
   /** Only entries after the last checkpoint with this label count. */
   since?: string | undefined;
   /** Pass when nothing matches instead of when something does. */
   not?: boolean | undefined;
}

export interface ExpectationResult {
   /** Whether the expectation held, after applying `not`. */
   passed: boolean;
   /** Whether any phrase matched, before applying `not`. */
   matched: boolean;
   entry?: DriverTranscriptEntry;
   checked: number;
   expected: string;
   since?: string | undefined;
   not: boolean;
}

/**
 * Checks the transcript for a phrase that matches; `since` and `not` narrow and invert
 * it.
 */
export function evaluateExpectation(
   entries: DriverTranscriptEntry[],
   options: ExpectationOptions,
): ExpectationResult {
   const phrases = selectTranscriptEntries(entries, { since: options.since }).filter(
      (entry) => entry.checkpoint === undefined,
   );
   const entry = phrases.find((candidate) =>
      matchesText(options.matcher, candidate.phrase),
   );
   const not = options.not === true;
   const result: ExpectationResult = {
      passed: not ? entry === undefined : entry !== undefined,
      matched: entry !== undefined,
      checked: phrases.length,
      expected: describeMatcher(options.matcher),
      since: options.since,
      not,
   };
   if (entry) {
      result.entry = entry;
   }
   return result;
}

/** The one-line reason an expectation failed, for the error envelope. */
export function describeExpectationFailure(result: ExpectationResult): string {
   const scope =
      result.since === undefined
         ? 'the transcript'
         : `the transcript since "${result.since}"`;
   if (result.not && result.entry) {
      return `${result.expected} was announced in ${scope}: "${result.entry.phrase}".`;
   }
   return `${result.expected} was not announced in ${scope} (${String(result.checked)} phrases checked).`;
}
