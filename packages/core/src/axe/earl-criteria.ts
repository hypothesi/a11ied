import { getAxeRule, WcagEngineNotFoundError } from '@a11ied/wcag-engine';

/**
 * EARL writes success criteria as slugs (`WCAG2:non-text-content`) while the axe rule
 * index stores numbers (`1.1.1`). `getAxeRule` already resolves each number to the
 * criterion, and every criterion carries its slug.
 *
 * An axe rule outside the generated index resolves to no criteria rather than throwing,
 * so a newer axe-core than the pinned artifacts still produces a valid report.
 */
export function listCriterionSlugs(axeRuleId: string, wcagVersion: string): string[] {
   try {
      return getAxeRule(axeRuleId, { version: wcagVersion }).criteria.map(
         (criterion) => criterion.slug,
      );
   } catch (error) {
      if (error instanceof WcagEngineNotFoundError) {
         return [];
      }
      throw error;
   }
}
