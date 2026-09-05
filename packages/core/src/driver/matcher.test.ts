import { describe, expect, it } from 'vitest';

import { CliUsageError } from '../errors/cli-errors.js';
import { evaluateExpectation } from './expectation.js';
import { describeMatcher, matchesText, parseTextMatcher } from './matcher.js';

describe('parseTextMatcher', () => {
   it('treats plain text as a case-insensitive substring', () => {
      const matcher = parseTextMatcher('Learn More');

      expect(matcher).toEqual({ kind: 'text', source: 'Learn More', flags: '' });
      expect(matchesText(matcher, 'link, learn more')).toBe(true);
      expect(matchesText(matcher, 'link, About us')).toBe(false);
      expect(describeMatcher(matcher)).toBe('"Learn More"');
   });

   it('treats /pattern/flags as a regular expression', () => {
      const matcher = parseTextMatcher('/^heading.*level [12]$/i');

      expect(matcher.kind).toBe('regex');
      expect(matchesText(matcher, 'Heading, Products, level 2')).toBe(true);
      expect(matchesText(matcher, 'heading, Pricing, level 3')).toBe(false);
      expect(describeMatcher(matcher)).toBe('/^heading.*level [12]$/i');
   });

   it('rejects a regular expression that does not compile', () => {
      expect(() => parseTextMatcher('/(/')).toThrow(CliUsageError);
   });
});

describe('evaluateExpectation', () => {
   const entries = [
      { index: 0, at: '2026-09-04T00:00:00.000Z', phrase: 'document' },
      { index: 1, at: '2026-09-04T00:00:01.000Z', phrase: '', checkpoint: 'opened' },
      { index: 2, at: '2026-09-04T00:00:02.000Z', phrase: 'button, Save' },
      { index: 3, at: '2026-09-04T00:00:03.000Z', phrase: 'Profile saved successfully.' },
   ];

   it('passes when a phrase matches and reports the entry', () => {
      const result = evaluateExpectation(entries, { matcher: parseTextMatcher('saved') });

      expect(result).toMatchObject({
         passed: true,
         matched: true,
         checked: entries.length - 1,
      });
      expect(result.entry?.phrase).toBe('Profile saved successfully.');
   });

   it('only counts phrases after the checkpoint with --since', () => {
      const result = evaluateExpectation(entries, {
         matcher: parseTextMatcher('document'),
         since: 'opened',
      });

      expect(result).toMatchObject({ passed: false, matched: false, checked: 2 });
   });

   it('inverts the verdict with --not', () => {
      const missing = evaluateExpectation(entries, {
         matcher: parseTextMatcher('error'),
         not: true,
      });
      const present = evaluateExpectation(entries, {
         matcher: parseTextMatcher('/save/i'),
         not: true,
      });

      expect(missing.passed).toBe(true);
      expect(present.passed).toBe(false);
      expect(present.entry?.phrase).toBe('button, Save');
   });
});
