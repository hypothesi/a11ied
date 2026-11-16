import type { StrategyArtifact } from '@a11ied/contracts';
import { describe, expect, it } from 'vitest';

import criteria22 from '../../data/generated/criteria.2.2.json' with { type: 'json' };
import rawStrategy22 from '../../data/generated/strategy.2.2.json' with { type: 'json' };

const strategy22 = rawStrategy22 as unknown as StrategyArtifact;

const CANONICAL_TOOLS = new Set([
   'review.start',
   'review.next',
   'review.judge',
   'review.report',
   'review.run',
   'audit_assessment',
   'record_result',
   'sr_session',
   'sr_action',
]);

const EXPECTED_WCAG_22_AA_COUNT = 55;

const EXPECTED_INAPPLICABILITY_KINDS: Readonly<Record<string, string>> = {
   '1.2.1': 'media-absence',
   '1.2.2': 'media-absence',
   '1.2.3': 'media-absence',
   '1.2.4': 'media-absence',
   '1.2.5': 'media-absence',
   '1.4.2': 'media-absence',
   '1.3.5': 'no-form',
   '3.2.2': 'no-form',
   '3.3.1': 'no-form',
   '3.3.2': 'no-form',
   '3.3.3': 'no-form',
   '3.3.4': 'no-form',
   '3.3.7': 'no-form',
   '3.3.8': 'no-authentication',
   '4.1.3': 'no-live-region',
   '2.2.1': 'no-timed-event',
   '2.2.2': 'no-animation',
   '2.3.1': 'no-animation',
   '2.4.5': 'no-multipage-context',
   '3.2.3': 'no-multipage-context',
   '3.2.4': 'no-multipage-context',
   '3.2.6': 'no-multipage-context',
   '2.5.1': 'no-multipoint-gesture',
   '2.5.7': 'no-dragging',
};

const TIER_0_BEHAVIORAL = new Set(['2.4.2', '3.1.1']);
const TIER_1_BEHAVIORAL = new Set([
   '1.3.4',
   '1.4.4',
   '1.4.10',
   '1.4.12',
   '2.1.4',
   '2.2.1',
   '2.2.2',
   '2.3.1',
   '2.4.7',
   '2.4.11',
   '2.5.4',
   '2.5.8',
]);

const TIER_0 = 0;
const TIER_1 = 1;
const TIER_2 = 2;

describe('curated 55-criterion registry completeness and tool parity', () => {
   const aAndAaCriteria = Object.values(criteria22.criteria).filter(
      (criterion) => criterion.level === 'A' || criterion.level === 'AA',
   );

   it('covers exactly 55 WCAG 2.2 A and AA criteria', () => {
      expect(aAndAaCriteria).toHaveLength(EXPECTED_WCAG_22_AA_COUNT);
   });

   it('routes broader procedures through coordinator evidence rather than state-local judgments', () => {
      const broader = Object.values(strategy22.strategies)
         .flatMap((strategy) => strategy.procedures)
         .filter(
            (procedure) => procedure.scope === 'site' || procedure.scope === 'journey',
         );

      expect(broader.length).toBeGreaterThan(0);
      for (const procedure of broader) {
         const calls = procedure.toolCalls ?? [];
         const [claim, record, evaluate] = calls;

         expect(calls.map((call) => call.tool)).to.eql([
            'audit_assessment',
            'record_result',
            'audit_assessment',
         ]);
         expect(claim?.args).toMatchObject({ action: 'next', scopes: [procedure.scope] });
         expect(evaluate?.args).toMatchObject({ action: 'evaluate' });
         expect(JSON.stringify(calls)).not.toContain('contrastRatio');
         expect(record?.expect).toContain('runFile');
         expect(record?.expect).toContain('explicit outcomes');
      }
   });

   it('ensures all 55 WCAG 2.2 A/AA criteria have tier, toolCalls, and done across all procedures', () => {
      for (const criterion of aAndAaCriteria) {
         const strategy = strategy22.strategies[criterion.id];
         expect(strategy).toBeDefined();
         if (!strategy) {
            continue;
         }
         expect(strategy.procedures.length).toBeGreaterThan(0);

         for (const procedure of strategy.procedures) {
            expect(procedure.tier).toBeDefined();
            expect([TIER_0, TIER_1, TIER_2]).toContain(procedure.tier);

            expect(procedure.toolCalls).toBeDefined();
            expect(procedure.toolCalls?.length).toBeGreaterThan(0);

            for (const toolCall of procedure.toolCalls ?? []) {
               expect(CANONICAL_TOOLS.has(toolCall.tool)).toBe(true);
               expect(toolCall.expect.length).toBeGreaterThan(0);
            }

            expect(procedure.done).toBeDefined();
            expect(procedure.done?.passed.length).toBeGreaterThan(0);
            expect(procedure.done?.failed.length).toBeGreaterThan(0);
            expect(procedure.done?.inapplicable.length).toBeGreaterThan(0);
            expect(procedure.done?.cantTell.length).toBeGreaterThan(0);
            expect(procedure.done?.allowedBlockerCodes?.length).toBeGreaterThan(0);
         }
      }
   });

   it('assigns correct evaluation tiers to scanner and behavioral procedures', () => {
      for (const criterion of aAndAaCriteria) {
         const strategy = strategy22.strategies[criterion.id];
         expect(strategy).toBeDefined();
         if (!strategy) {
            continue;
         }
         for (const procedure of strategy.procedures) {
            if (procedure.procedureId === 'axe_scan') {
               expect(procedure.tier).toBe(TIER_0);
            } else if (TIER_0_BEHAVIORAL.has(criterion.id)) {
               expect(procedure.tier).toBe(TIER_0);
            } else if (TIER_1_BEHAVIORAL.has(criterion.id)) {
               expect(procedure.tier).toBe(TIER_1);
            } else {
               expect(procedure.tier).toBe(TIER_2);
            }
         }
      }
   });

   it('maps criteria to their expected generalized InapplicabilityKind', () => {
      for (const [criterionId, expectedKind] of Object.entries(
         EXPECTED_INAPPLICABILITY_KINDS,
      )) {
         const strategy = strategy22.strategies[criterionId];
         expect(strategy).toBeDefined();
         if (!strategy) {
            continue;
         }

         const behavioral = strategy.procedures.find(
            (procedure) => procedure.procedureId !== 'axe_scan',
         );
         expect(behavioral).toBeDefined();
         expect(behavioral?.done?.inapplicabilityKind).toBe(expectedKind);
         expect(behavioral?.inapplicability?.kind).toBe(expectedKind);
      }
   });
});
