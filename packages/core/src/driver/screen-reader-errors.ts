import { cliExitCodes } from '@a11ied/contracts';

/** How many of the checked phrases a failure message lists, newest last. */
const LISTED_PHRASES = 10;

export interface SpokenFailureDetails {
   /** What was looked for, as the caller wrote it. */
   expected: string;
   /** Every phrase that was checked, in the order the reader said them. */
   phrases: readonly string[];
}

/** Lists the last few checked phrases, one per line, for a failure message. */
export function listCheckedPhrases(phrases: readonly string[]): string {
   if (phrases.length === 0) {
      return 'The reader said nothing.';
   }
   const shown = phrases.slice(-LISTED_PHRASES),
      skipped = phrases.length - shown.length;
   const lines = shown.map((phrase) => `  "${phrase}"`);
   const prefix =
      skipped > 0
         ? `The reader said (last ${String(shown.length)} of ${String(phrases.length)}):`
         : 'The reader said:';
   return [prefix, ...lines].join('\n');
}

/**
 * Thrown by `expectSpoken`, `wait`, `find`, and `goTo` when the reader did not say or
 * reach what the test asked for. `exitCode` is the CLI's assertion exit code, 4, so a
 * script can pass it straight to `process.exitCode`.
 */
export class ScreenReaderAssertionError extends Error {
   readonly exitCode = cliExitCodes.assertion;
   readonly expected: string;
   readonly phrases: readonly string[];

   constructor(message: string, details: SpokenFailureDetails) {
      super(message);
      this.name = 'ScreenReaderAssertionError';
      this.expected = details.expected;
      this.phrases = details.phrases;
   }
}
