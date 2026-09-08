import { describe, expect, it } from 'vitest';

import type { AxeRuleResult, AxeRunResult } from '@a11ied/contracts';

import { buildAxeEarlReport, listAxeEarlAssertions } from './earl.js';

/** `buildRule` puts two nodes on the rule, so the report profile yields two assertions. */
const RULE_NODE_COUNT = 2;

function buildRule(overrides: Partial<AxeRuleResult> = {}): AxeRuleResult {
   return {
      id: 'image-alt',
      impact: 'critical',
      description: 'Images must have alternate text',
      help: 'Images must have alternate text',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.13/image-alt',
      tags: ['wcag111'],
      nodes: [
         { target: ['main > img:nth-child(2)'], html: '<img src="a.png">' },
         { target: ['footer img'], html: '<img src="b.png">' },
      ],
      ...overrides,
   };
}

function buildResult(overrides: Partial<AxeRunResult> = {}): AxeRunResult {
   return {
      url: 'https://example.com/cart',
      wcagVersion: '2.2',
      selection: { kind: 'all', resolvedRuleIds: ['image-alt'] },
      ruleIds: ['image-alt'],
      violations: [buildRule()],
      passes: [],
      incomplete: [],
      inapplicable: [],
      ...overrides,
   };
}

function assertActProfileFoldsNodes(): void {
   const assertions = listAxeEarlAssertions(buildResult(), 'act');

   expect(assertions).toHaveLength(1);
   expect(assertions[0]?.outcome).toStrictEqual('failed');
   expect(assertions[0]?.pointer).toBeUndefined();
}

function assertReportProfileKeepsNodes(): void {
   const assertions = listAxeEarlAssertions(buildResult(), 'report');

   expect(assertions).toHaveLength(RULE_NODE_COUNT);
   expect(assertions.map((entry) => entry.pointer)).toEqual([
      'main > img:nth-child(2)',
      'footer img',
   ]);
}

function assertBucketsMapToOutcomes(): void {
   const assertions = listAxeEarlAssertions(
      buildResult({
         violations: [buildRule({ id: 'image-alt' })],
         passes: [buildRule({ id: 'label' })],
         incomplete: [buildRule({ id: 'color-contrast' })],
         inapplicable: [buildRule({ id: 'video-caption' })],
      }),
      'act',
   );

   expect(
      Object.fromEntries(
         assertions.map((entry) => [entry.procedure?.title, entry.outcome]),
      ),
   ).toEqual({
      'image-alt': 'failed',
      label: 'passed',
      'color-contrast': 'cantTell',
      'video-caption': 'inapplicable',
   });
}

function assertEmptyRunIsUntested(): void {
   const assertions = listAxeEarlAssertions(buildResult({ violations: [] }), 'act');

   expect(assertions).toHaveLength(1);
   expect(assertions[0]?.outcome).toStrictEqual('untested');
   expect(assertions[0]?.procedure).toBeUndefined();
}

function assertCriterionSlugsResolve(): void {
   const report = buildAxeEarlReport([buildResult()], {
      profile: 'act',
      version: '0.1.0',
   });

   expect(report['@graph'][0]?.test?.isPartOf).toEqual(['WCAG2:non-text-content']);
}

function assertAssertorNamesTheRelease(): void {
   const report = buildAxeEarlReport([buildResult()], {
      profile: 'act',
      version: '0.1.0',
   });

   expect(report['@graph'][0]?.assertedBy).toStrictEqual(
      'https://github.com/silvermine/a11ied/releases/tag/0.1.0',
   );
}

describe('buildAxeEarlReport', () => {
   it('folds a rule to one assertion under the act profile', assertActProfileFoldsNodes);
   it(
      'writes one assertion per node under the report profile',
      assertReportProfileKeepsNodes,
   );
   it('maps each axe bucket to its EARL outcome', assertBucketsMapToOutcomes);
   it('reports untested when a run produced no rule results', assertEmptyRunIsUntested);
   it('resolves axe criterion numbers to WCAG slugs', assertCriterionSlugsResolve);
   it('names the a11ied release as the assertor', assertAssertorNamesTheRelease);
});
