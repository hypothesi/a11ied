import { buildA11iedAssertor } from '@a11ied/core';
import { buildEarlReport } from '@a11ied/earl';
import type { EarlAssertionInput, EarlReport } from '@a11ied/contracts';
import { getAxeRule } from '@a11ied/wcag-engine';

import type { ActTestCase } from './corpus.js';
import type { CaseOutcome } from './run.js';

export interface RuleScore {
   actRuleId: string;
   axeRuleId: string;
   cases: number;
   agreed: number;
   declined: number;
   contradictions: number;
}

/** Per rule and procedure counts, sorted so the worst pairs read first. */
export function scoreByRule(outcomes: CaseOutcome[]): RuleScore[] {
   const scores = new Map<string, RuleScore>();

   for (const outcome of outcomes) {
      const key = `${outcome.actRuleId}|${outcome.axeRuleId}`;
      const score = scores.get(key) ?? {
         actRuleId: outcome.actRuleId,
         axeRuleId: outcome.axeRuleId,
         cases: 0,
         agreed: 0,
         declined: 0,
         contradictions: 0,
      };
      score.cases += 1;
      if (outcome.contradiction) {
         score.contradictions += 1;
      } else if (outcome.actual === 'cantTell' || outcome.actual === 'untested') {
         score.declined += 1;
      } else {
         score.agreed += 1;
      }
      scores.set(key, score);
   }

   return [...scores.values()].toSorted(
      (left, right) =>
         right.contradictions - left.contradictions ||
         left.actRuleId.localeCompare(right.actRuleId),
   );
}

function listCriterionSlugs(axeRuleId: string): string[] {
   try {
      return getAxeRule(axeRuleId).criteria.map((criterion) => criterion.slug);
   } catch {
      return [];
   }
}

/**
 * Builds the EARL report for a W3C submission.
 *
 * `subject.source` is the canonical w3.org URL from the test case index, not the local
 * server the scan loaded, because a report full of `127.0.0.1` URLs cannot be submitted.
 * The `act` profile writes no `result.pointer`; no accepted report carries one.
 */
export function buildConformanceEarlReport(input: {
   outcomes: CaseOutcome[];
   testCases: ActTestCase[];
   version: string;
}): EarlReport {
   const scored: EarlAssertionInput[] = input.outcomes.map((outcome) => ({
      subject: outcome.sourceUrl,
      outcome: outcome.actual,
      mode: 'automatic',
      procedure: {
         title: outcome.axeRuleId,
         criterionSlugs: listCriterionSlugs(outcome.axeRuleId),
      },
   }));

   /*
    * A test case whose ACT rule a11ied does not implement gets an `untested` assertion
    * with no procedure, which is how the reference reports declare the edge of their own
    * coverage. Omitting it entirely would leave a reader unable to tell a rule a11ied
    * skipped from one it ran and found nothing on.
    */
   /*
    * Key by test case and ACT rule together. The corpus reuses one HTML file across
    * several rules: 1,213 test cases share 1,100 testcase ids, and the same file can be a
    * passing example for one rule and a failing example for another. Keying by id alone
    * would call a rule tested because a different rule happened to scan the same file.
    */
   const decided = new Set(
      input.outcomes.map((outcome) => `${outcome.testcaseId}|${outcome.actRuleId}`),
   );
   const untested: EarlAssertionInput[] = input.testCases
      .filter((testCase) => !decided.has(`${testCase.testcaseId}|${testCase.ruleId}`))
      .map((testCase) => ({
         subject: testCase.url,
         outcome: 'untested' as const,
         mode: 'automatic' as const,
      }));

   return buildEarlReport({
      assertions: [...scored, ...untested],
      assertor: buildA11iedAssertor(input.version),
   });
}
