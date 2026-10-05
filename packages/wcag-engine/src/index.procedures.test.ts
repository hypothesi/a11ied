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
            expect(procedure.version).toStrictEqual('1');
            expect(procedure.actions.length).toBeGreaterThan(0);
            expect(procedure.requiredEvidence).toContain('action-trace');
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

describe('evidence required by behavioral procedures', () => {
   it('requires real speech for status checks and measured evidence for thresholds', () => {
      const contrast = getTestMethod('1.4.3').strategy.procedures.find(
            (procedure) => procedure.procedureId !== 'axe_scan',
         ),
         flashes = getTestMethod('2.3.1').strategy.procedures[0],
         status = getTestMethod('4.1.3').strategy.procedures[0];

      expect(status?.requiredCapabilities).toContain('real-reader');
      expect(status?.requiredEvidence).toContain('speech');
      expect(flashes?.requiredEvidence).toContain('measurement');
      expect(flashes?.limitations.join(' ')).toContain('Unaided visual judgment');
      expect(contrast?.requiredEvidence).toContain('measurement');
   });
   it('requires pointer and programmatic inspection support for the actions that need them', () => {
      const gesture = getTestMethod('2.5.1').strategy.procedures.find(
            (procedure) => procedure.procedureId !== 'axe_scan',
         ),
         parsing = getTestMethod('4.1.1', { version: '2.1' }).strategy.procedures.find(
            (procedure) => procedure.procedureId !== 'axe_scan',
         ),
         purpose = getTestMethod('1.3.5').strategy.procedures.find(
            (procedure) => procedure.procedureId !== 'axe_scan',
         );

      expect(gesture?.requiredCapabilities).toContain('pointer');
      expect(purpose?.requiredCapabilities).toContain('dom');
      expect(parsing?.requiredCapabilities).toContain('markup-validation');
      expect(parsing?.requiredEvidence).toContain('observation');
   });
});
