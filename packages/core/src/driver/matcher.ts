import { CliUsageError } from '../errors/cli-errors.js';

/** What `sr wait --for`, `sr expect`, and batch `expect` lines compare phrases against. */
export interface TextMatcher {
   kind: 'text' | 'regex';
   source: string;
   flags: string;
}

const REGEX_LITERAL_PATTERN = /^\/(.+)\/([a-z]*)$/su;

/**
 * Parses `/pattern/flags` as a regular expression and anything else as text that is
 * matched without regard to case.
 */
export function parseTextMatcher(input: string): TextMatcher {
   const literal = REGEX_LITERAL_PATTERN.exec(input);
   if (!literal) {
      return { kind: 'text', source: input, flags: '' };
   }
   const [, source = '', flags = ''] = literal;
   try {
      const compiled = new RegExp(source, flags);
      return { kind: 'regex', source: compiled.source, flags: compiled.flags };
   } catch (error) {
      throw new CliUsageError(
         'validation-error',
         `"${input}" is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`,
         { field: 'pattern', value: input },
      );
   }
}

/** Whether one phrase satisfies the matcher. */
export function matchesText(matcher: TextMatcher, phrase: string): boolean {
   if (matcher.kind === 'regex') {
      return new RegExp(matcher.source, matcher.flags).test(phrase);
   }
   return phrase.toLowerCase().includes(matcher.source.toLowerCase());
}

/** The matcher as the user wrote it, for messages. */
export function describeMatcher(matcher: TextMatcher): string {
   if (matcher.kind === 'regex') {
      return `/${matcher.source}/${matcher.flags}`;
   }
   return `"${matcher.source}"`;
}
