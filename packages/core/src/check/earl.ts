import type { EarlAssertionInput, EarlProfile, EarlReport } from '@a11ied/contracts';
import { buildEarlReport } from '@a11ied/earl';
import { getCriterion, WcagEngineNotFoundError } from '@a11ied/wcag-engine';

import { buildA11iedAssertor, listAxeEarlAssertions } from '../axe/earl.js';
import { getCriterionOutcome } from './criteria-rollup.js';
import type { PageCheck } from './runtime.js';

/** EARL writes a success criterion as its slug, and the check stores its number. */
function listCriterionSlug(criterionId: string, wcagVersion: string): string[] {
   try {
      return [getCriterion(criterionId, { version: wcagVersion }).criterion.slug];
   } catch (error) {
      if (error instanceof WcagEngineNotFoundError) {
         return [];
      }
      throw error;
   }
}

export interface CheckEarlReportOptions {
   profile: EarlProfile;
   version: string;
}

/**
 * Builds one EARL 1.0 report for `a1 check --format earl`: the axe results, plus one
 * assertion per criterion that is failed, cannot be told, or untested. A scanner never
 * yields a passed criterion.
 */
export function buildCheckEarlReport(
   check: PageCheck,
   options: CheckEarlReportOptions,
): EarlReport {
   const criteria = check.criteria.map((criterion): EarlAssertionInput => {
      const outcome = getCriterionOutcome(criterion);
      return {
         subject: check.axe.url,
         outcome: outcome === 'notTested' ? 'untested' : outcome,
         mode: 'automatic',
         procedure: {
            title: `WCAG ${criterion.id}: ${criterion.title}`,
            criterionSlugs: listCriterionSlug(criterion.id, check.axe.wcagVersion),
         },
      };
   });
   return buildEarlReport({
      assertions: [...listAxeEarlAssertions(check.axe, options.profile), ...criteria],
      assertor: buildA11iedAssertor(options.version),
   });
}
