import { describe, expect, it } from 'vitest';

import { WcagEngineNotFoundError, getMobileGuidance } from './index.js';

describe('wcag-engine mobile guidance lookup', () => {
   it('resolves a criterion by id or slug to what WCAG2Mobile says about it', () => {
      const byId = getMobileGuidance('2.5.1');
      const bySlug = getMobileGuidance('pointer-gestures');

      expect(byId?.criterionId).toBe('2.5.1');
      expect(byId?.state).toBe('guidance');
      expect(byId?.guidance.length).toBeGreaterThan(0);
      expect(byId?.notes.length).toBeGreaterThan(0);
      expect(byId?.url).toBe(
         'https://w3c.github.io/matf/#success-criterion-2-5-1-pointer-gestures',
      );
      expect(bySlug).toEqual(byId);
   });

   it('reports a criterion the task force has not written up yet as a placeholder', () => {
      const guidance = getMobileGuidance('1.4.3');

      expect(guidance?.state).toBe('placeholder');
      expect(guidance?.guidance).toBe('');
      expect(guidance?.openIssueUrl).toBeTruthy();
   });

   it('returns nothing for a level AAA criterion, which the document does not cover', () => {
      expect(getMobileGuidance('1.4.6')).toBeUndefined();
   });

   it('throws a typed not-found error for an unknown criterion', () => {
      expect(() => getMobileGuidance('9.9.9')).toThrowError(WcagEngineNotFoundError);
   });
});
