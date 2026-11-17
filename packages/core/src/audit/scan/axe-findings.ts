import type { AxeRuleResult, AxeRunResult } from '@a11ied/contracts';
import type { Severity } from '@a11ied/audit';

const LOCATION_LIMIT = 5;
const WCAG_TAG = /^wcag(?<principle>\d)(?<guideline>\d)(?<criterion>\d{1,2})$/u;

/** A defect axe is certain of, ready to be recorded against one criterion. */
export interface AxeFinding {
   criterion: string;
   key: string;
   title: string;
   severity: Severity;
   description: string;
   impact: string;
   recommendation: string;
   location: string;
   detail: string;
}

/** Reads the success criteria an axe rule tests from its `wcag143`-style tags. */
export function getCriteriaFromAxeTags(tags: readonly string[]): string[] {
   return tags.flatMap((tag) => {
      const groups = WCAG_TAG.exec(tag)?.groups;
      return groups
         ? [
              `${groups['principle'] ?? ''}.${groups['guideline'] ?? ''}.${groups['criterion'] ?? ''}`,
           ]
         : [];
   });
}

/** Turns axe's multi-line failure summary into one readable sentence. */
function describeFix(rule: AxeRuleResult): string {
   const lines = (rule.nodes[0]?.failureSummary ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
   const heading = lines.at(0) ?? '';
   const options = lines.slice(1);
   const summary = options.length > 0 ? `${heading} ${options.join('; ')}.` : heading;
   return summary === '' ? `See ${rule.helpUrl}` : `${summary} See ${rule.helpUrl}`;
}

function toFinding(rule: AxeRuleResult, criterion: string): AxeFinding {
   const selectors = rule.nodes.map((node) => node.target.join(' '));
   const more = selectors.length - LOCATION_LIMIT;
   return {
      criterion,
      key: `axe:${rule.id}`,
      title: rule.help,
      severity: rule.impact ?? 'moderate',
      description: `${rule.description}. Detected by the axe-core rule "${rule.id}".`,
      impact: `People who rely on assistive technology or adapted presentation cannot perceive or operate the affected elements as intended (axe-core rates this ${rule.impact ?? 'moderate'}).`,
      recommendation: describeFix(rule),
      location: selectors.slice(0, LOCATION_LIMIT).join(', '),
      detail:
         more > 0
            ? `${String(selectors.length)} elements; ${String(more)} more not listed`
            : `${String(selectors.length)} ${selectors.length === 1 ? 'element' : 'elements'}`,
   };
}

/**
 * Turns axe violations into findings for the criteria in scope. A violation is the only
 * scanner output treated as a decision; passes and incomplete checks are not.
 */
export function listAxeFindings(
   result: AxeRunResult,
   scope: readonly string[],
): AxeFinding[] {
   return result.violations.flatMap((rule) =>
      getCriteriaFromAxeTags(rule.tags)
         .filter((criterion) => scope.includes(criterion))
         .map((criterion) => toFinding(rule, criterion)),
   );
}

/** Summarizes what axe reported, including the checks it could not decide. */
export function buildAxeSignal(result: AxeRunResult): unknown {
   const summarize = (rule: AxeRuleResult): unknown => ({
      rule: rule.id,
      help: rule.help,
      elements: rule.nodes.length,
      criteria: getCriteriaFromAxeTags(rule.tags),
   });
   return {
      violations: result.violations.map((rule) => summarize(rule)),
      needsReview: result.incomplete.map((rule) => summarize(rule)),
      rulesPassed: result.passes.length,
   };
}
