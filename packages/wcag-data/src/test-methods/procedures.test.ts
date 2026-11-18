import type { StrategyArtifact } from '@a11ied/contracts';
import { describe, expect, it } from 'vitest';

import criteria22 from '../../data/generated/criteria.2.2.json' with { type: 'json' };
import rawStrategy22 from '../../data/generated/strategy.2.2.json' with { type: 'json' };

const strategy22 = rawStrategy22 as unknown as StrategyArtifact;

const EXPECTED_WCAG_22_AA_COUNT = 55;
const SITE_SCOPED_CRITERIA = ['2.4.5', '3.2.3', '3.2.4', '3.2.6'];

describe('curated procedure catalog', () => {
   const aAndAaCriteria = Object.values(criteria22.criteria).filter(
      (criterion) => criterion.level === 'A' || criterion.level === 'AA',
   );

   it('covers exactly 55 WCAG 2.2 A and AA criteria', () => {
      expect(aAndAaCriteria).toHaveLength(EXPECTED_WCAG_22_AA_COUNT);
   });

   it('gives every A and AA criterion one judged procedure with complete guidance', () => {
      for (const criterion of aAndAaCriteria) {
         const judged = (strategy22.strategies[criterion.id]?.procedures ?? []).filter(
            (procedure) => procedure.procedureId !== 'axe_scan',
         );

         expect(judged, criterion.id).toHaveLength(1);
         expect(judged[0]?.applicability.length).toBeGreaterThan(0);
         expect(judged[0]?.actions.length).toBeGreaterThan(0);
         expect(judged[0]?.evaluation.failed.length).toBeGreaterThan(0);
         expect(judged[0]?.evaluation.inapplicable.length).toBeGreaterThan(0);
      }
   });

   it('names no tool or workflow, so the guidance outlives any one command set', () => {
      const text = JSON.stringify(strategy22.strategies);

      expect(text).not.toMatch(
         /review\.(?:start|next|judge)|audit_assessment|record_result|blockerCode/u,
      );
   });

   it('marks the criteria that compare pages as broader than one state', () => {
      for (const id of SITE_SCOPED_CRITERIA) {
         const scopes = (strategy22.strategies[id]?.procedures ?? [])
            .filter((procedure) => procedure.procedureId !== 'axe_scan')
            .map((procedure) => procedure.scope);

         expect(scopes, id).not.toContain('state');
      }
   });
});
