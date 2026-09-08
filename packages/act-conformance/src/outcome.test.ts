import { describe, expect, it } from 'vitest';

import type { AxeRuleResult, AxeRunResult } from '@a11ied/contracts';

import { isContradiction, reduceRuleOutcome } from './outcome.js';

function buildRule(id: string): AxeRuleResult {
   return {
      id,
      impact: 'critical',
      description: id,
      help: id,
      helpUrl: `https://dequeuniversity.com/rules/axe/4.13/${id}`,
      tags: [],
      nodes: [],
   };
}

function buildResult(overrides: Partial<AxeRunResult> = {}): AxeRunResult {
   return {
      url: 'https://example.com',
      wcagVersion: '2.2',
      selection: { kind: 'all', resolvedRuleIds: [] },
      ruleIds: [],
      violations: [],
      passes: [],
      incomplete: [],
      inapplicable: [],
      ...overrides,
   };
}

function assertFailedWins(): void {
   const result = buildResult({
      violations: [buildRule('image-alt')],
      passes: [buildRule('image-alt')],
   });

   expect(reduceRuleOutcome(result, 'image-alt')).toStrictEqual('failed');
}

function assertCantTellBeatsPassed(): void {
   const result = buildResult({
      incomplete: [buildRule('color-contrast')],
      passes: [buildRule('color-contrast')],
   });

   expect(reduceRuleOutcome(result, 'color-contrast')).toStrictEqual('cantTell');
}

function assertAbsentRuleIsUntested(): void {
   expect(reduceRuleOutcome(buildResult(), 'image-alt')).toStrictEqual('untested');
}

function assertPassedExampleReportedFailed(): void {
   expect(isContradiction('passed', 'failed')).toStrictEqual(true);
   expect(isContradiction('inapplicable', 'failed')).toStrictEqual(true);
}

function assertFailedExampleReportedClean(): void {
   expect(isContradiction('failed', 'passed')).toStrictEqual(true);
   expect(isContradiction('failed', 'inapplicable')).toStrictEqual(true);
}

function assertDecliningIsNeverAContradiction(): void {
   const expected = ['passed', 'failed', 'inapplicable'] as const;

   expect(
      expected.every(
         (value) =>
            !isContradiction(value, 'cantTell') && !isContradiction(value, 'untested'),
      ),
   ).toStrictEqual(true);
}

function assertAgreementIsNotAContradiction(): void {
   expect(isContradiction('passed', 'passed')).toStrictEqual(false);
   expect(isContradiction('failed', 'failed')).toStrictEqual(false);
   expect(isContradiction('inapplicable', 'inapplicable')).toStrictEqual(false);
   expect(isContradiction('passed', 'inapplicable')).toStrictEqual(false);
}

describe('reduceRuleOutcome', () => {
   it('takes failed over every other outcome', assertFailedWins);
   it('takes cantTell over passed', assertCantTellBeatsPassed);
   it('reports untested when the rule produced nothing', assertAbsentRuleIsUntested);
});

describe('isContradiction', () => {
   it(
      'flags a passed or inapplicable example reported as failed',
      assertPassedExampleReportedFailed,
   );
   it(
      'flags a failed example reported as passed or inapplicable',
      assertFailedExampleReportedClean,
   );
   it('never flags cantTell or untested', assertDecliningIsNeverAContradiction);
   it('does not flag agreement', assertAgreementIsNotAContradiction);
});
