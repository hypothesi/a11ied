import type { AxeRunResult, AxeRuleResult, EvidenceRecord } from '@a11ied/contracts';
import { describe, expect, it } from 'vitest';

import { buildCriteriaRollup, getCriterionOutcome } from './criteria-rollup.js';
import { buildReportModel } from '../report/aggregate.js';
import {
   buildReportTestAudit,
   buildReportTestInventory,
} from '../report/test-fixtures.js';
import { getTestMethod } from '@a11ied/wcag-engine';
import { buildPageEarlAssertions } from './earl.js';

const emptyAxe: AxeRunResult = {
   url: 'https://example.com/',
   wcagVersion: '2.2',
   selection: { kind: 'level', level: 'AA', resolvedRuleIds: [] },
   ruleIds: [],
   violations: [],
   passes: [],
   incomplete: [],
   inapplicable: [],
};

function listMappedRules(ids: string[]): AxeRuleResult[] {
   return ids
      .flatMap((id) => getTestMethod(id).testMethod.axeRuleIds)
      .map((id) => ({
         id,
         description: id,
         help: id,
         helpUrl: 'https://createdbyfireside.com/',
         tags: [],
         nodes: [],
      }));
}

describe('scanner rule coverage', () => {
   it('keeps whole criteria unresolved after clean mapped scanner checks', () => {
      const ids = ['1.1.1', '2.1.1', '2.4.4', '4.1.2'],
         passes = listMappedRules(ids);
      const criteria = buildCriteriaRollup({
            version: '2.2',
            level: 'AA',
            axe: { ...emptyAxe, passes },
            relevanceStates: {},
         }),
         model = buildReportModel(buildReportTestInventory(), [
            {
               pageId: 'home-a1b2c3d4',
               report: { ...buildReportTestAudit(), criteria },
            },
         ]);

      for (const id of ids) {
         expect(criteria.find((entry) => entry.id === id)?.pending).toStrictEqual(true);
         expect(
            model.pages[0]?.criteria.find((entry) => entry.criterionId === id)?.outcome,
         ).toStrictEqual('notTested');
      }
   });
});

describe('incomplete scanner checks', () => {
   it('preserves incomplete scan results even alongside passing evidence', () => {
      const criterionId = '1.1.1',
         incomplete = listMappedRules([criterionId]);
      const recorded: EvidenceRecord[] = [
         {
            subject: emptyAxe.url,
            test: { kind: 'criterion', criterionId, procedureId: 'manual_review' },
            outcome: 'passed',
            mode: 'manual',
            recordedAt: new Date().toISOString(),
         },
      ];
      const criteria = buildCriteriaRollup({
            version: '2.2',
            level: 'AA',
            axe: { ...emptyAxe, incomplete },
            relevanceStates: {},
            recorded,
         }),
         model = buildReportModel(buildReportTestInventory(), [
            {
               pageId: 'home-a1b2c3d4',
               report: {
                  ...buildReportTestAudit(),
                  axe: { ...emptyAxe, incomplete },
                  criteria,
                  recorded,
               },
            },
         ]);

      expect(
         criteria.find((entry) => entry.id === criterionId)?.axeVerdict,
      ).toStrictEqual('incomplete');
      expect(
         model.pages[0]?.criteria.find((entry) => entry.criterionId === criterionId)
            ?.outcome,
      ).toStrictEqual('cantTell');
      const assertions = buildPageEarlAssertions(
         {
            ...buildReportTestAudit(),
            axe: { ...emptyAxe, incomplete },
            criteria,
            recorded,
         },
         'report',
      );

      expect(
         assertions.find((entry) => entry.procedure?.title.startsWith('WCAG 1.1.1:'))
            ?.outcome,
      ).toStrictEqual('cantTell');
   });
});

describe('scanner completion alongside criterion assessment', () => {
   it('requires all mapped scanner checks and verified criterion evidence', () => {
      const criterionId = '1.1.1',
         inapplicable = listMappedRules([criterionId]),
         recorded: EvidenceRecord[] = [
            {
               subject: emptyAxe.url,
               test: { kind: 'criterion', criterionId, procedureId: 'wcag_1_1_1' },
               outcome: 'inapplicable',
               mode: 'manual',
               recordedAt: new Date().toISOString(),
            },
         ];
      const complete = buildCriteriaRollup({
            version: '2.2',
            level: 'AA',
            axe: { ...emptyAxe, inapplicable },
            relevanceStates: {},
            recorded,
         }).find((entry) => entry.id === criterionId),
         partial = buildCriteriaRollup({
            version: '2.2',
            level: 'AA',
            axe: { ...emptyAxe, passes: inapplicable.slice(0, 1) },
            relevanceStates: {},
            recorded,
         }).find((entry) => entry.id === criterionId);

      expect(complete?.axeVerdict).toStrictEqual('pass');
      expect(complete?.pending).toStrictEqual(true);
      expect(partial?.axeVerdict).toStrictEqual('not-covered');
      expect(partial?.pendingProcedureIds).to.eql(['wcag_1_1_1', 'axe_scan']);
      if (!complete || !partial) {
         throw new Error('The fixture needs complete and partial criteria.');
      }

      expect(getCriterionOutcome(complete)).toStrictEqual('notTested');
      expect(getCriterionOutcome(partial)).toStrictEqual('notTested');
   });
});

describe('criterion scope and evidence', () => {
   it('omits criteria above the requested conformance level', () => {
      const criteria = buildCriteriaRollup({
         version: '2.2',
         level: 'AA',
         axe: emptyAxe,
         relevanceStates: {},
      });

      expect(criteria.some((criterion) => criterion.level === 'AAA')).toBe(false);
      expect(criteria.some((criterion) => criterion.level === 'AA')).toBe(true);
      expect(criteria.some((criterion) => criterion.level === 'A')).toBe(true);
   });

   it('keeps conflicting unverified judgments out of criterion outcomes', () => {
      const recorded: EvidenceRecord[] = [
         {
            subject: emptyAxe.url,
            test: {
               kind: 'criterion',
               criterionId: '3.3.8',
               procedureId: 'auth_flow_probe',
            },
            outcome: 'failed',
            mode: 'manual',
            recordedAt: new Date().toISOString(),
         },
         {
            subject: emptyAxe.url,
            test: {
               kind: 'criterion',
               criterionId: '3.3.8',
               procedureId: 'manual_review',
            },
            outcome: 'passed',
            mode: 'manual',
            recordedAt: new Date().toISOString(),
         },
      ];
      const criteria = buildCriteriaRollup({
         version: '2.2',
         level: 'AA',
         axe: emptyAxe,
         relevanceStates: {},
         recorded,
      });

      expect(
         criteria.find((criterion) => criterion.id === '3.3.8')?.recordedOutcome,
      ).toBeUndefined();
   });
});

describe('criterion procedure completion', () => {
   it('keeps criterion-specific procedures pending after a legacy generic pass', () => {
      const recorded: EvidenceRecord[] = [
         {
            subject: emptyAxe.url,
            test: {
               kind: 'criterion',
               criterionId: '1.1.1',
               procedureId: 'manual_review',
            },
            outcome: 'passed',
            mode: 'manual',
            recordedAt: new Date().toISOString(),
         },
      ];
      const criterion = buildCriteriaRollup({
         version: '2.2',
         level: 'AA',
         axe: emptyAxe,
         relevanceStates: {},
         recorded,
      }).find((entry) => entry.id === '1.1.1');

      expect(criterion?.pending).toStrictEqual(true);
      expect(criterion?.pendingProcedureIds).to.eql(['wcag_1_1_1', 'axe_scan']);
      expect(criterion?.recordedOutcome).toBeUndefined();
   });
});
