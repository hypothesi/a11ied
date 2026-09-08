import type { AxeRunResult, EarlOutcome } from '@a11ied/contracts';

/**
 * ACT Rules Format 1.1 section 4.14.1 orders outcomes when one procedure reports several
 * for a single test case. The first one present wins.
 */
export const OUTCOME_PRECEDENCE: EarlOutcome[] = [
   'failed',
   'untested',
   'cantTell',
   'passed',
   'inapplicable',
];

export type ExpectedOutcome = 'passed' | 'failed' | 'inapplicable';

/**
 * Reduces one axe rule's buckets to a single outcome for one test case.
 *
 * A rule that appears in no bucket produced nothing, which is `untested` rather than
 * `inapplicable`. Conflating the two would claim the rule ran and found the page out of
 * scope, and that claim can contradict an expected `failed`.
 */
export function reduceRuleOutcome(result: AxeRunResult, axeRuleId: string): EarlOutcome {
   const present: EarlOutcome[] = [];
   if (result.violations.some((rule) => rule.id === axeRuleId)) {
      present.push('failed');
   }
   if (result.incomplete.some((rule) => rule.id === axeRuleId)) {
      present.push('cantTell');
   }
   if (result.passes.some((rule) => rule.id === axeRuleId)) {
      present.push('passed');
   }
   if (result.inapplicable.some((rule) => rule.id === axeRuleId)) {
      present.push('inapplicable');
   }

   return OUTCOME_PRECEDENCE.find((outcome) => present.includes(outcome)) ?? 'untested';
}

/**
 * Whether a reported outcome contradicts what the test case expects.
 *
 * `cantTell` and `untested` never contradict. Reporting nothing never contradicts. Those
 * are the two ways a tool honestly declines to decide, and ACT treats both as silence
 * rather than as a wrong answer.
 */
export function isContradiction(expected: ExpectedOutcome, actual: EarlOutcome): boolean {
   if (actual === 'cantTell' || actual === 'untested') {
      return false;
   }
   if (expected === 'failed') {
      return actual === 'passed' || actual === 'inapplicable';
   }
   return actual === 'failed';
}
