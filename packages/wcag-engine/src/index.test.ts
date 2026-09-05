import type {
   CriterionSearchMatch,
   CriterionSearchResult,
   NormalizedCriterion,
} from '@a11ied/contracts';

import { describe, expect, it } from 'vitest';

import {
   WcagEngineNotFoundError,
   WcagEngineValidationError,
   getAxeRule,
   getCoverage,
   getCoverageSummary,
   getCriterion,
   getCriterionApplicability,
   getQuickrefTags,
   getTechnique,
   getUnderstanding,
   listApplicableCriteria,
   listCriteriaByLevel,
   resetWcagEngineCache,
   supportedApplicabilitySignalCategories,
   supportedApplicabilityStates,
   searchCriteria,
} from './index.js';
import { getApplicabilityFixture } from './applicability/fixtures.js';

describe('wcag-engine lookup', () => {
   it('resolves the same criterion by id and slug', () => {
      resetWcagEngineCache();
      const byId = getCriterion('4.1.3');
      const bySlug = getCriterion('status-messages');

      expect(byId.criterion.id).toBe('4.1.3');
      expect(bySlug.criterion.id).toBe('4.1.3');
      expect(byId.criterion.id).toBe(bySlug.criterion.id);
      expect(byId.criterion.title).toBe(bySlug.criterion.title);
      expect(byId.criterion.level).toBe(bySlug.criterion.level);
   });

   it.each([
      ['A', '2.2'],
      ['AA', '2.2'],
      ['AAA', '2.2'],
      ['A', '2.1'],
   ] as const)('lists criteria by level %s for WCAG %s', (level, version) => {
      const result = listCriteriaByLevel(level, version);

      expect(result.level).toBe(level);
      expect(result.version).toBe(version);
      expect(
         result.criteria.every(
            (criterion: NormalizedCriterion) =>
               criterion.level === level && criterion.wcagVersion === version,
         ),
      ).toBe(true);
   });
});

describe('wcag-engine search', () => {
   it('finds the status messages criterion by plain-language query with match metadata', () => {
      const result = searchCriteria('status message');
      const match = result.results.find(
         (entry: CriterionSearchResult) => entry.criterionId === '4.1.3',
      );

      expect(result.results[0]?.criterionId).toBe('4.1.3');
      expect(match).toBeDefined();
      expect(match?.matches.length).toBeGreaterThan(0);
      expect(
         match?.matches.some(
            (entry: CriterionSearchMatch) =>
               entry.field === 'title' || entry.field === 'summary',
         ),
      ).toBe(true);
   });

   it('searches techniques and failures as well as titles', () => {
      const result = searchCriteria('structural markup relationships content');

      expect(
         result.results.some(
            (entry: CriterionSearchResult) => entry.criterionId === '1.3.1',
         ),
      ).toBe(true);
   });
});

describe('wcag-engine coverage and strategy', () => {
   it('joins coverage data to the canonical criterion model', () => {
      const result = getCoverage('4.1.2');

      expect(result.criterion.id).toBe('4.1.2');
      expect(result.coverage.coverageState).toBe('automated');
      expect(result.coverage.axeRuleIds.length).toBeGreaterThan(0);
      expect(result.coverage.actRuleIds.length).toBeGreaterThan(0);
      expect(result.strategy.procedureIds).toContain('axe_scan');
   });

   it('exposes quickref tags by id or slug', () => {
      const result = getQuickrefTags('status-messages');

      expect(result.criterionId).toBe('4.1.3');
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.tags).toContain('forms');
   });

   it('returns the pinned coverage totals per level', () => {
      const summary = getCoverageSummary({ version: '2.2' });

      expect(summary.version).toBe('2.2');
      expect(summary.totals.criteria).toBe(
         summary.byLevel.A.criteria +
            summary.byLevel.AA.criteria +
            summary.byLevel.AAA.criteria,
      );
   });
});

describe('wcag-engine technique and axe rule lookup', () => {
   it('resolves a technique and a failure to the criteria that list them', () => {
      const technique = getTechnique('G18');
      const failure = getTechnique('F65');

      expect(technique.technique.kind).toBe('sufficient');
      expect(technique.technique.url).toBe(
         'https://www.w3.org/WAI/WCAG22/Techniques/general/G18',
      );
      expect(technique.criteria.map((criterion) => criterion.id)).toContain('1.4.3');
      expect(failure.technique.kind).toBe('failure');
      expect(failure.criteria.map((criterion) => criterion.id)).toEqual(['1.1.1']);
   });

   it('maps an axe rule id back to its criteria', () => {
      const result = getAxeRule('color-contrast');

      expect(result.rule.criterionIds).toContain('1.4.3');
      expect(result.criteria.map((criterion) => criterion.id)).toEqual(
         result.rule.criterionIds,
      );
      expect(result.criteria[0]?.level).toBe('AA');
      expect(result.rule.tags).toContain('wcag143');
   });

   it('throws typed not-found errors for unknown techniques and rules', () => {
      expect(() => getTechnique('G9999')).toThrowError(/technique lookup failed/i);
      expect(() => getAxeRule('not-a-rule')).toThrowError(WcagEngineNotFoundError);
   });

   it('includes a technique body and its source document when the sync fetched one', () => {
      const technique = getTechnique('G164');

      expect(technique.document?.title).toBeTruthy();
      expect(technique.document?.url).toBe(
         'https://www.w3.org/WAI/WCAG22/Techniques/general/G164',
      );
      expect(technique.body?.length).toBeGreaterThan(0);
   });
});

describe('wcag-engine understanding document lookup', () => {
   it('resolves a criterion by id or slug to its full Understanding document', () => {
      const byId = getUnderstanding('2.4.2');
      const bySlug = getUnderstanding('page-titled');

      expect(byId.criterion.id).toBe('2.4.2');
      expect(byId.document.url).toBe(
         'https://www.w3.org/WAI/WCAG22/Understanding/page-titled',
      );
      expect(byId.document.title).toBeTruthy();
      expect(byId.document.status).toBeTruthy();
      expect(byId.body.length).toBeGreaterThan(0);
      expect(bySlug.body).toBe(byId.body);
   });

   it('throws a typed not-found error for an unknown criterion', () => {
      expect(() => getUnderstanding('9.9.9')).toThrowError(WcagEngineNotFoundError);
   });
});

describe('wcag-engine error handling', () => {
   it('throws typed not-found errors for unsupported criterion ids', () => {
      expect(() => getCriterion('9.9.9')).toThrowError(WcagEngineNotFoundError);

      try {
         getCriterion('9.9.9');
         throw new Error('expected getCriterion to throw');
      } catch (error) {
         expect(error).toBeInstanceOf(WcagEngineNotFoundError);
         const typedError = error as WcagEngineNotFoundError;
         expect(typedError.payload).toMatchObject({
            type: 'not-found',
            lookupKey: '9.9.9',
         });
      }
   });

   it('throws typed validation errors for unsupported WCAG versions', () => {
      expect(() => listCriteriaByLevel('AA', '2.0')).toThrowError(
         WcagEngineValidationError,
      );

      try {
         listCriteriaByLevel('AA', '2.0');
         throw new Error('expected listCriteriaByLevel to throw');
      } catch (error) {
         expect(error).toBeInstanceOf(WcagEngineValidationError);
         const typedError = error as WcagEngineValidationError;
         expect(typedError.payload).toMatchObject({
            type: 'validation-error',
            field: 'version',
            value: '2.0',
            supportedVersions: ['2.1', '2.2'],
         });
      }
   });
});

describe('wcag-engine applicability state classification', () => {
   it('exposes the supported applicability states and signal categories', () => {
      expect(supportedApplicabilityStates).toEqual([
         'applicable',
         'not-detected',
         'out-of-scope',
         'unknown',
      ]);
      expect(supportedApplicabilitySignalCategories).toContain('auth');
      expect(supportedApplicabilitySignalCategories).toContain('live-region');
      expect(supportedApplicabilitySignalCategories).toContain('widget');
   });

   it('keeps authentication-only criteria out of scope for a plain content page without overclaiming', () => {
      const result = getCriterionApplicability(
         '3.3.8',
         getApplicabilityFixture('basic-page.html'),
      );

      expect(result.assessment.state).toBe('not-detected');
      expect(result.assessment.reasons.join(' ')).toMatch(/authentication-flow signals/i);
   });

   it('marks status messages as applicable when live-region signals are present', () => {
      const result = getCriterionApplicability(
         '4.1.3',
         getApplicabilityFixture('status-message.html'),
      );

      expect(result.assessment.state).toBe('applicable');
      expect(result.assessment.reasons.join(' ')).toMatch(/live region/i);
      expect(result.assessment.reasons.join(' ')).toMatch(/role=status|aria-live/i);
   });

   it('marks accessible authentication as applicable for an auth flow', () => {
      const result = getCriterionApplicability(
         '3.3.8',
         getApplicabilityFixture('auth-login.html'),
      );

      expect(result.assessment.state).toBe('applicable');
      expect(result.assessment.reasons.join(' ')).toMatch(/authentication signals/i);
   });
});

describe('wcag-engine applicability signal matching', () => {
   it('returns dialog-related criteria as relevant for dialog structure', () => {
      const result = listApplicableCriteria(getApplicabilityFixture('dialog.html'));
      const assessments = Object.values(result.assessments);
      const dialogRows = assessments.filter((assessment) =>
         assessment.matchedSignalCategories.includes('dialog'),
      );

      expect(dialogRows.length).toBeGreaterThan(0);
      expect(dialogRows.some((assessment) => assessment.state === 'applicable')).toBe(
         true,
      );
      expect(
         dialogRows.some((assessment) =>
            assessment.reasons.join(' ').match(/dialog structure/i),
         ),
      ).toBe(true);
   });

   it('references both target signals and quickref tags in first-pass hints', () => {
      const result = getCriterionApplicability(
         '4.1.3',
         getApplicabilityFixture('status-message.html'),
      );
      const joinedReasons = result.assessment.reasons.join(' ');

      expect(result.assessment.matchedTags).toContain('forms');
      expect(result.assessment.matchedTags).toContain('messaging');
      expect(joinedReasons).toMatch(/criterion tags/i);
      expect(joinedReasons).toMatch(/live region/i);
   });

   it('keeps unknown custom widgets unknown instead of pretending they are not applicable', () => {
      const result = listApplicableCriteria(
         getApplicabilityFixture('custom-widget.html'),
      );
      const unknownRows = Object.values(result.assessments).filter(
         (assessment) => assessment.state === 'unknown',
      );

      expect(unknownRows.length).toBeGreaterThan(0);
      expect(
         unknownRows.some((assessment) =>
            assessment.matchedSignalCategories.includes('widget'),
         ),
      ).toBe(true);
   });
});
