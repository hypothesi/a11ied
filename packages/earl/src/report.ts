import {
   earlReportSchema,
   type EarlAssertionInput,
   type EarlAssertor,
   type EarlReport,
} from '@a11ied/contracts';

import { toEarlAssertion } from './assertion.js';

/**
 * The JSON-LD context the W3C ACT report reader expects. It binds `earl:`, `WCAG2:`,
 * `sch:`, and `doap:` so the report's short property names resolve.
 */
export const ACT_EARL_CONTEXT_URL =
   'https://www.w3.org/WAI/content-assets/wcag-act-rules/earl-context.json';

export interface BuildEarlReportInput {
   assertions: EarlAssertionInput[];
   assertor: EarlAssertor;
}

/**
 * Builds an EARL 1.0 report as JSON-LD.
 *
 * The graph is a flat list of assertions, each carrying its own `subject` and
 * `assertedBy`. That is the layout of every report the W3C has accepted, including
 * axe-core's. Grouping assertions under a `TestSubject` is legal JSON-LD but no accepted
 * report uses it.
 */
export function buildEarlReport(input: BuildEarlReportInput): EarlReport {
   return earlReportSchema.parse({
      '@context': ACT_EARL_CONTEXT_URL,
      '@graph': input.assertions.map((assertion) =>
         toEarlAssertion(assertion, input.assertor),
      ),
   });
}
