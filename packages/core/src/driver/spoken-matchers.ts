import type { DriverCurrentItem, DriverTranscriptEntry } from '@a11ied/contracts';

import { matchesItem, type WantedItem } from './broker-loops.js';
import { describeExpectationFailure, evaluateExpectation } from './expectation.js';
import { describeMatcher, matchesText, type TextMatcher } from './matcher.js';
import {
   listCheckedPhrases,
   ScreenReaderAssertionError,
} from './screen-reader-errors.js';
import { selectTranscriptEntries } from './transcript-recorder.js';

/** What `expectSpoken` and the matchers compare against: text without case, or a pattern. */
export type SpokenMatch = string | RegExp;

export interface SpokenOptions {
   /** Only phrases after the last checkpoint with this label count. */
   since?: string | undefined;
   /** Pass when nothing matches instead of when something does. */
   not?: boolean | undefined;
}

/**
 * The outcome of one check, worded for both directions so `expect(...).not` can show the
 * right sentence.
 */
export interface SpokenCheck {
   pass: boolean;
   /** Why the check failed, or would fail, as written. */
   failure: string;
   /** Why the check failed, or would fail, when the caller negated it. */
   negatedFailure: string;
   /** The phrases that were checked, for the error's details. */
   phrases: string[];
}

/** Turns a string or RegExp into the matcher the transcript checks use. */
export function toTextMatcher(match: SpokenMatch): TextMatcher {
   if (typeof match === 'string') {
      return { kind: 'text', source: match, flags: '' };
   }
   return { kind: 'regex', source: match.source, flags: match.flags };
}

/** The phrases of a transcript, without its checkpoint entries. */
export function transcriptPhrases(entries: readonly DriverTranscriptEntry[]): string[] {
   return entries
      .filter((entry) => entry.checkpoint === undefined)
      .map((entry) => entry.phrase);
}

/**
 * Whether the transcript has a phrase matching `match`, within `since` and `not`. An
 * unknown `since` label throws, the same as `sr expect --since`.
 */
export function checkSpoken(
   entries: DriverTranscriptEntry[],
   match: SpokenMatch,
   options: SpokenOptions = {},
): SpokenCheck {
   const matcher = toTextMatcher(match),
      phrases = transcriptPhrases(
         selectTranscriptEntries(entries, { since: options.since }),
      );
   const result = evaluateExpectation(entries, { matcher, since: options.since });
   const listed = listCheckedPhrases(phrases);
   const announced = describeExpectationFailure({ ...result, not: true }),
      notAnnounced = `${describeExpectationFailure({ ...result, not: false })}\n${listed}`;
   return {
      pass: options.not ? !result.matched : result.matched,
      failure: options.not ? announced : notAnnounced,
      negatedFailure: options.not ? notAnnounced : announced,
      phrases,
   };
}

interface InOrderSearch {
   missing: TextMatcher | undefined;
   lastMatched: string | undefined;
}

/** Finds each matcher after the previous match and stops at the first one not found. */
function findInOrder(
   phrases: readonly string[],
   matchers: readonly TextMatcher[],
   position: { from: number; lastMatched: string | undefined },
): InOrderSearch {
   const [matcher, ...rest] = matchers;
   if (matcher === undefined) {
      return { missing: undefined, lastMatched: position.lastMatched };
   }
   const index = phrases.findIndex(
      (phrase, at) => at >= position.from && matchesText(matcher, phrase),
   );
   if (index === -1) {
      return { missing: matcher, lastMatched: position.lastMatched };
   }
   return findInOrder(phrases, rest, { from: index + 1, lastMatched: phrases[index] });
}

/**
 * Whether the transcript has phrases matching each of `matches`, in that order, with any
 * number of other phrases between them.
 */
export function checkSpokenInOrder(
   entries: DriverTranscriptEntry[],
   matches: readonly SpokenMatch[],
   options: Pick<SpokenOptions, 'since'> = {},
): SpokenCheck {
   const matchers = matches.map((match) => toTextMatcher(match)),
      phrases = transcriptPhrases(
         selectTranscriptEntries(entries, { since: options.since }),
      );
   const { missing, lastMatched } = findInOrder(phrases, matchers, {
      from: 0,
      lastMatched: undefined,
   });
   const wanted = matchers.map((matcher) => describeMatcher(matcher)).join(', then ');
   const after = lastMatched === undefined ? '' : ` after "${lastMatched}"`;
   const failure = missing
      ? `${describeMatcher(missing)} was not announced${after}. Wanted ${wanted} (${String(phrases.length)} phrases checked).\n${listCheckedPhrases(phrases)}`
      : '';
   return {
      pass: missing === undefined,
      failure,
      negatedFailure: `${wanted} were all announced in that order.\n${listCheckedPhrases(phrases)}`,
      phrases,
   };
}

function describeItem(item: DriverCurrentItem | undefined): string {
   if (!item) {
      return 'nothing (the reader reported no current item)';
   }
   const name = item.name === undefined ? '' : ` named "${item.name}"`,
      role = item.role ?? 'an item with no role';
   return `${role}${name} (phrase: "${item.phrase ?? ''}")`;
}

/** Whether the current item has the wanted role, name, or both. */
export function checkCurrentItem(
   item: DriverCurrentItem | undefined,
   wanted: WantedItem,
): SpokenCheck {
   const pass = item !== undefined && matchesItem(item, wanted);
   const want = [
      wanted.role === undefined ? undefined : `role "${wanted.role}"`,
      wanted.name === undefined ? undefined : `name "${wanted.name}"`,
   ]
      .filter((part) => part !== undefined)
      .join(' and ');
   const actual = describeItem(item);
   return {
      pass,
      failure: `Expected the cursor to be on ${want}, but it is on ${actual}.`,
      negatedFailure: `Expected the cursor not to be on ${want}, but it is on ${actual}.`,
      phrases: item?.phrase === undefined ? [] : [item.phrase],
   };
}

/** Throws the assertion error for a failed check. `expected` is what the caller asked for. */
export function assertCheckPassed(check: SpokenCheck, expected: string): void {
   if (check.pass) {
      return;
   }
   throw new ScreenReaderAssertionError(check.failure, {
      expected,
      phrases: check.phrases,
   });
}
