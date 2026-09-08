import { describe, expect, it } from 'vitest';

import type { EarlAssertionInput, EarlAssertor } from '@a11ied/contracts';

import { ACT_EARL_CONTEXT_URL, buildEarlReport } from './index.js';

const assertor: EarlAssertor = {
   name: 'a11ied',
   url: 'https://github.com/silvermine/a11ied/releases/tag/0.1.0',
   revision: '0.1.0',
};

const CASE_URL =
   'https://www.w3.org/WAI/content-assets/wcag-act-rules/testcases/73f2c2/eabc191.html';

function buildOne(overrides: Partial<EarlAssertionInput> = {}): EarlAssertionInput {
   return {
      subject: CASE_URL,
      outcome: 'passed',
      mode: 'automatic',
      procedure: { title: 'image-alt', criterionSlugs: ['non-text-content'] },
      ...overrides,
   };
}

function assertFlatGraph(): void {
   const report = buildEarlReport({ assertions: [buildOne()], assertor });

   expect(report['@context']).toStrictEqual(ACT_EARL_CONTEXT_URL);
   expect(report['@graph']).toHaveLength(1);
   expect(report['@graph'][0]?.['@type']).toStrictEqual('Assertion');
}

function assertPrefixes(): void {
   const report = buildEarlReport({
      assertions: [buildOne({ outcome: 'cantTell' })],
      assertor,
   });
   const assertion = report['@graph'][0];

   expect(assertion?.result.outcome).toStrictEqual('earl:cantTell');
   expect(assertion?.mode).toStrictEqual('earl:automatic');
   expect(assertion?.test?.isPartOf).toEqual(['WCAG2:non-text-content']);
}

function assertAssertorOnEvery(): void {
   const report = buildEarlReport({
      assertions: [buildOne(), buildOne({ outcome: 'failed' })],
      assertor,
   });

   expect(report['@graph'].map((entry) => entry.assertedBy)).toEqual([
      assertor.url,
      assertor.url,
   ]);
}

function assertUntestedOmitsTest(): void {
   const report = buildEarlReport({
      assertions: [{ subject: CASE_URL, outcome: 'untested', mode: 'automatic' }],
      assertor,
   });
   const assertion = report['@graph'][0];

   expect(assertion?.result.outcome).toStrictEqual('earl:untested');
   expect(assertion && 'test' in assertion).toStrictEqual(false);
}

function assertPointerIsOptional(): void {
   const report = buildEarlReport({
      assertions: [buildOne(), buildOne({ pointer: 'main > img:nth-child(2)' })],
      assertor,
   });

   expect(report['@graph'][0]?.result.pointer).toBeUndefined();
   expect(report['@graph'][1]?.result.pointer).toStrictEqual('main > img:nth-child(2)');
}

function assertSubjectType(): void {
   const report = buildEarlReport({ assertions: [buildOne()], assertor });

   expect(report['@graph'][0]?.subject).toEqual({
      '@type': ['earl:TestSubject', 'sch:WebPage'],
      source: CASE_URL,
   });
}

function assertProcedureUrlBecomesId(): void {
   const report = buildEarlReport({
      assertions: [
         buildOne({
            procedure: {
               title: 'image-alt',
               url: 'https://dequeuniversity.com/rules/axe/4.13/image-alt',
               criterionSlugs: ['non-text-content'],
            },
         }),
      ],
      assertor,
   });

   expect(report['@graph'][0]?.test?.['@id']).toStrictEqual(
      'https://dequeuniversity.com/rules/axe/4.13/image-alt',
   );
}

describe('buildEarlReport', () => {
   it('writes the ACT context and a flat graph of assertions', assertFlatGraph);
   it('prefixes outcomes with earl: and criteria with WCAG2:', assertPrefixes);
   it('names the assertor on every assertion', assertAssertorOnEvery);
   it('omits test entirely for an untested subject', assertUntestedOmitsTest);
   it('carries a pointer only when one was supplied', assertPointerIsOptional);
   it('types the subject so the W3C reader sees a web page', assertSubjectType);
   it('writes the procedure url as the test @id', assertProcedureUrlBecomesId);
});
