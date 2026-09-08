import type { EarlAssertion, EarlAssertionInput, EarlAssertor } from '@a11ied/contracts';

/**
 * The prefix the ACT EARL context binds to `http://www.w3.org/TR/WCAG21/#`, so
 * `WCAG2:non-text-content` resolves to the success criterion's own section.
 */
export const WCAG2_PREFIX = 'WCAG2:';

type SubjectType = EarlAssertion['subject']['@type'];

function buildSubjectType(): SubjectType {
   return ['earl:TestSubject', 'sch:WebPage'];
}

function buildTest(input: EarlAssertionInput): EarlAssertion['test'] {
   const { procedure } = input;
   if (!procedure) {
      return undefined;
   }
   return {
      '@type': 'TestCase',
      title: procedure.title,
      ...(procedure.url === undefined ? {} : { '@id': procedure.url }),
      isPartOf: procedure.criterionSlugs.map((slug) => `${WCAG2_PREFIX}${slug}`),
   };
}

function buildResult(input: EarlAssertionInput): EarlAssertion['result'] {
   return {
      '@type': 'TestResult',
      outcome: `earl:${input.outcome}`,
      ...(input.pointer === undefined ? {} : { pointer: input.pointer }),
      ...(input.info === undefined ? {} : { info: input.info }),
   };
}

/**
 * Turns one result into an EARL assertion. An input with no `procedure` becomes an
 * assertion with no `test`, which is how a report says it ran nothing applicable to the
 * subject.
 */
export function toEarlAssertion(
   input: EarlAssertionInput,
   assertor: EarlAssertor,
): EarlAssertion {
   const test = buildTest(input);
   return {
      '@type': 'Assertion',
      ...(input.mode === undefined ? {} : { mode: `earl:${input.mode}` }),
      subject: { '@type': buildSubjectType(), source: input.subject },
      assertedBy: assertor.url,
      result: buildResult(input),
      ...(test === undefined ? {} : { test }),
   };
}
