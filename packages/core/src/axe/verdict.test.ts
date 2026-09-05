import { describe, expect, it } from 'vitest';

import type { AxeRuleResult } from '@a11ied/contracts';

import { buildBaselineFromViolations, evaluateAxeVerdict } from './verdict.js';

function rule(
   id: string,
   impact: AxeRuleResult['impact'],
   targets: string[][],
): AxeRuleResult {
   return {
      id,
      impact,
      description: id,
      help: id,
      helpUrl: 'https://example.com/rule',
      tags: [],
      nodes: targets.map((target) => ({ target, html: '<div></div>' })),
   };
}

describe('evaluateAxeVerdict', () => {
   it('fails on any violation by default', () => {
      const verdict = evaluateAxeVerdict({
         violations: [rule('color-contrast', 'serious', [['div']])],
         failOn: 'minor',
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.totalViolationNodes).toBe(1);
      expect(verdict.failingFindings).toEqual([
         { ruleId: 'color-contrast', impact: 'serious', target: ['div'] },
      ]);
   });

   it('passes when no violations are present', () => {
      const verdict = evaluateAxeVerdict({ violations: [], failOn: 'minor' });
      expect(verdict.passed).toBe(true);
      expect(verdict.totalViolationNodes).toBe(0);
   });

   it('ignores violations below the fail-on threshold', () => {
      const verdict = evaluateAxeVerdict({
         violations: [
            rule('minor-rule', 'minor', [['a']]),
            rule('critical-rule', 'critical', [['b']]),
         ],
         failOn: 'critical',
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.failingFindings.map((finding) => finding.ruleId)).toEqual([
         'critical-rule',
      ]);
   });

   it('always counts a violation with no impact, regardless of fail-on', () => {
      const verdict = evaluateAxeVerdict({
         violations: [rule('no-impact-rule', undefined, [['a']])],
         failOn: 'critical',
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.failingFindings).toHaveLength(1);
   });
});

describe('evaluateAxeVerdict / baselines', () => {
   it('excludes a violation node that matches the baseline', () => {
      const violations = [rule('button-name', 'critical', [['button']])];
      const baseline = buildBaselineFromViolations(violations);

      const verdict = evaluateAxeVerdict({ violations, failOn: 'minor', baseline });

      expect(verdict.passed).toBe(true);
      expect(verdict.baselinedCount).toBe(1);
      expect(verdict.failingFindings).toHaveLength(0);
   });

   it('still fails on a new finding not covered by the baseline', () => {
      const baselined = rule('button-name', 'critical', [['button']]);
      const baseline = buildBaselineFromViolations([baselined]);
      const newFinding = rule('link-name', 'serious', [['a']]);

      const verdict = evaluateAxeVerdict({
         violations: [baselined, newFinding],
         failOn: 'minor',
         baseline,
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.baselinedCount).toBe(1);
      expect(verdict.failingFindings).toEqual([
         { ruleId: 'link-name', impact: 'serious', target: ['a'] },
      ]);
   });
});

describe('buildBaselineFromViolations', () => {
   it('keys each accepted finding by rule id and node target', () => {
      const baseline = buildBaselineFromViolations([
         rule('button-name', 'critical', [['button'], ['a button']]),
      ]);

      expect(baseline.acceptedFindings).toEqual([
         'button-name::a button',
         'button-name::button',
      ]);
   });
});
