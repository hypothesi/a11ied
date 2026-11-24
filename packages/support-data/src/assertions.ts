import type { ScreenReaderTestCase, SpecAssertion } from './types.js';

function slugifyAssertionID(prefix: string, index: number): string {
   return `${prefix}-${String(index + 1)}`;
}

function appendPreActionAssertions(
   testCase: ScreenReaderTestCase,
   assertions: SpecAssertion[],
): void {
   const rule = testCase.evaluation;
   if (rule.mode !== 'interact' || !rule.preActionExpectedPhrases) {
      return;
   }
   for (const phrase of rule.preActionExpectedPhrases) {
      assertions.push({
         id: slugifyAssertionID(testCase.slug, assertions.length),
         priority: 'MUST',
         statement: `Convey initial control text "${phrase}" before activation`,
         featureRef: testCase.attribute,
         rule: {
            kind: 'convey-phrase',
            phrase,
            scope: 'pre-action',
         },
      });
   }
}

function resolvePhraseScope(
   mode: ScreenReaderTestCase['evaluation']['mode'],
   minCount: number,
): 'any' | 'post-action' | 'target' {
   if (minCount > 1) {
      return 'any';
   }
   return mode === 'interact' ? 'post-action' : 'target';
}

function formatExpectedPhraseStatement(
   phrase: string,
   mode: ScreenReaderTestCase['evaluation']['mode'],
   minCount: number,
): string {
   if (minCount > 1) {
      return `Convey "${phrase}" across at least ${String(minCount)} elements`;
   }
   if (mode === 'interact') {
      return `Convey dynamic announcement "${phrase}" after activation`;
   }
   return `Convey expected accessible text "${phrase}" on the target`;
}

function appendExpectedPhraseAssertions(
   testCase: ScreenReaderTestCase,
   assertions: SpecAssertion[],
): void {
   const rule = testCase.evaluation;
   const minCount = rule.minimumOccurrences ?? 1;
   const scope = resolvePhraseScope(rule.mode, minCount);
   for (const phrase of rule.expectedPhrases) {
      assertions.push({
         id: slugifyAssertionID(testCase.slug, assertions.length),
         priority: 'MUST',
         statement: formatExpectedPhraseStatement(phrase, rule.mode, minCount),
         featureRef: testCase.attribute,
         rule: {
            kind: 'convey-phrase',
            phrase,
            scope,
            minCount,
         },
      });
   }
}

function appendForbiddenAssertions(
   testCase: ScreenReaderTestCase,
   assertions: SpecAssertion[],
): void {
   const rule = testCase.evaluation;
   const scope = rule.mode === 'interact' ? 'post-action' : 'target';
   for (const phrase of rule.forbiddenPhrases ?? []) {
      assertions.push({
         id: slugifyAssertionID(testCase.slug, assertions.length),
         priority: 'MUST',
         statement: `Do not announce overridden or prohibited phrase "${phrase}" on the target`,
         featureRef: testCase.attribute,
         rule: {
            kind: 'omit-phrase',
            phrase,
            scope,
         },
      });
   }
}

function appendMaxOccurrenceAssertions(
   testCase: ScreenReaderTestCase,
   assertions: SpecAssertion[],
): void {
   const maxMap = testCase.evaluation.maxPhraseOccurrences;
   if (!maxMap) {
      return;
   }
   for (const [phrase, maxAllowed] of Object.entries(maxMap)) {
      assertions.push({
         id: slugifyAssertionID(testCase.slug, assertions.length),
         priority: 'MUST',
         statement: `Do not leak prohibited text "${phrase}" beyond ${String(maxAllowed)} occurrence(s)`,
         featureRef: testCase.attribute,
         rule: {
            kind: 'max-occurrences',
            phrase,
            max: maxAllowed,
         },
      });
   }
}

function appendStateAndRoleAssertions(
   testCase: ScreenReaderTestCase,
   assertions: SpecAssertion[],
): void {
   const rule = testCase.evaluation;
   const scope = rule.mode === 'interact' ? 'post-action' : 'target';
   for (const stateTerm of rule.expectedStateTerms ?? []) {
      assertions.push({
         id: slugifyAssertionID(testCase.slug, assertions.length),
         priority: 'MUST',
         statement: `Convey required ARIA state "${stateTerm}"`,
         featureRef: testCase.attribute,
         rule: {
            kind: 'convey-state',
            stateTerm,
            scope,
         },
      });
   }

   if (rule.targetRoleHint && rule.mode === 'walk') {
      assertions.push({
         id: slugifyAssertionID(testCase.slug, assertions.length),
         priority: 'SHOULD',
         statement: `Convey expected semantics/role "${rule.targetRoleHint}"`,
         featureRef: testCase.attribute,
         rule: {
            kind: 'convey-role',
            roleHint: rule.targetRoleHint,
         },
      });
   }
}

/**
 * Resolves explicit RFC-2119 assertions for a test case, deriving spec assertions from
 * the evaluation rules when explicit assertions are not declared inline.
 */
export function resolveCaseAssertions(
   testCase: ScreenReaderTestCase,
): readonly SpecAssertion[] {
   if (testCase.assertions && testCase.assertions.length > 0) {
      return testCase.assertions;
   }

   const assertions: SpecAssertion[] = [];
   appendPreActionAssertions(testCase, assertions);
   appendExpectedPhraseAssertions(testCase, assertions);
   appendForbiddenAssertions(testCase, assertions);
   appendMaxOccurrenceAssertions(testCase, assertions);
   appendStateAndRoleAssertions(testCase, assertions);

   assertions.push({
      id: slugifyAssertionID(testCase.slug, assertions.length),
      priority: 'MUST',
      statement: 'Cause no severe negative side effects',
      featureRef: testCase.attribute,
      rule: {
         kind: 'no-side-effects',
      },
   });

   return assertions;
}
