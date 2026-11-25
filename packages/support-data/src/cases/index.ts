import type { ScreenReaderTestCase, TestCategory } from '../types.js';
import { ariaCurrentCases } from './aria-current.js';
import { ariaDescribedbyCases } from './aria-describedby.js';
import { ariaDisabledCases } from './aria-disabled.js';
import { ariaExpandedCases } from './aria-expanded.js';
import { ariaHiddenCases } from './aria-hidden.js';
import { ariaLabelCases } from './aria-label.js';
import { ariaLabelledbyCases } from './aria-labelledby.js';
import { ariaLiveCases } from './aria-live.js';
import { roleAlertCases } from './role-alert.js';

export const screenReaderTests: readonly ScreenReaderTestCase[] = [
   ...ariaLabelledbyCases,
   ...ariaLabelCases,
   ...ariaDescribedbyCases,
   ...ariaHiddenCases,
   ...ariaExpandedCases,
   ...ariaDisabledCases,
   ...ariaCurrentCases,
   ...ariaLiveCases,
   ...roleAlertCases,
];

function assertUniqueSlugs(cases: readonly ScreenReaderTestCase[]): void {
   const seen = new Set<string>();
   for (const testCase of cases) {
      if (seen.has(testCase.slug)) {
         throw new Error(`Duplicate screen reader test slug: "${testCase.slug}".`);
      }
      seen.add(testCase.slug);
   }
}

assertUniqueSlugs(screenReaderTests);

export function listTestCases(): readonly ScreenReaderTestCase[] {
   return screenReaderTests;
}

export function getTestCaseBySlug(slug: string): ScreenReaderTestCase | undefined {
   return screenReaderTests.find((testCase) => testCase.slug === slug);
}

export function listAttributes(): readonly string[] {
   const unique = new Set(screenReaderTests.map((testCase) => testCase.attribute));
   return [...unique];
}

export function listCategories(): readonly TestCategory[] {
   const unique = new Set(screenReaderTests.map((testCase) => testCase.category));
   return [...unique];
}
