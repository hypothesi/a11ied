import { describe, expect, it } from 'vitest';

import { getTestMethod, getTestMethodSummary, listCriteriaByLevel } from './index.js';

const LEVELS = ['A', 'AA', 'AAA'] as const,
   VERSIONS = ['2.1', '2.2'] as const;

describe.each(VERSIONS)('WCAG %s desktop procedure catalog', (version) => {
   it('provides executable criterion-specific guidance for every A and AA criterion', () => {
      const criteria = ['A', 'AA'].flatMap(
         (level) => listCriteriaByLevel(level, version).criteria,
      );

      for (const criterion of criteria) {
         const strategy = getTestMethod(criterion.id, { version }).strategy;

         expect(strategy.coverageGap).toBeUndefined();
         expect(strategy.procedureIds).not.toContain('manual_review');
         expect(strategy.procedures.map((procedure) => procedure.procedureId)).to.eql(
            strategy.procedureIds,
         );
         expect(
            strategy.procedures.some((procedure) => procedure.procedureId !== 'axe_scan'),
         ).toStrictEqual(true);
         for (const procedure of strategy.procedures) {
            expect(procedure.criterionId).toStrictEqual(criterion.id);
            expect(procedure.actions.length).toBeGreaterThan(0);
            expect(Object.keys(procedure.evaluation)).to.eql([
               'passed',
               'failed',
               'inapplicable',
               'cantTell',
            ]);
            expect(procedure.sources.map((source) => source.kind)).to.eql([
               'normative',
               'informative',
            ]);
         }
      }
   });

   it('reports catalog completeness and explicit gaps for every selectable level', () => {
      const coverage = getTestMethodSummary({ version }).procedureCoverage,
         criteria = LEVELS.flatMap(
            (level) => listCriteriaByLevel(level, version).criteria,
         );

      expect(coverage).toBeDefined();
      for (const criterion of criteria) {
         const strategy = getTestMethod(criterion.id, { version }).strategy;
         if (criterion.level === 'AAA') {
            expect(strategy.coverageGap).toContain(criterion.id);
            expect(coverage?.gapCriterionIds).toContain(criterion.id);
         } else {
            expect(coverage?.definedCriterionIds).toContain(criterion.id);
         }
      }
      expect(
         new Set([
            ...(coverage?.definedCriterionIds ?? []),
            ...(coverage?.gapCriterionIds ?? []),
         ]).size,
      ).toStrictEqual(criteria.length);
   });
});

describe('limits stated by behavioral procedures', () => {
   it('warns that flashing thresholds cannot be judged by eye', () => {
      const flashes = getTestMethod('2.3.1').strategy.procedures[0];

      expect(flashes?.limitations.join(' ')).toContain('Unaided visual judgment');
   });
});
