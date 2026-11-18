import type { AxeNodeResult, AxeRuleResult, AxeRunResult } from '@a11ied/contracts';
import type { Severity } from '@a11ied/audit';

const LOCATION_LIMIT = 5;
const TAG_NAME = /^<(?<tag>[a-z][a-z0-9-]*)/iu;
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
   /** The first failing element, for a screenshot. */
   selector: string;
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
function describeFix(failureSummary: string, helpUrl: string): string {
   const lines = failureSummary
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
   const heading = lines.at(0) ?? '';
   const options = lines.slice(1);
   const summary = options.length > 0 ? `${heading} ${options.join('; ')}.` : heading;
   return summary === '' ? `See ${helpUrl}` : `${summary} See ${helpUrl}`;
}

function getTagName(node: AxeNodeResult): string {
   return TAG_NAME.exec(node.html)?.groups?.['tag']?.toLowerCase() ?? 'element';
}

/**
 * Splits a rule's failing elements by tag name. One rule often fails for unrelated
 * reasons on different elements, such as contrast on a button and on a caption, and each
 * needs its own finding and fix.
 */
function groupNodesByTag(rule: AxeRuleResult): Map<string, AxeNodeResult[]> {
   const groups = new Map<string, AxeNodeResult[]>();
   for (const node of rule.nodes) {
      const tag = getTagName(node);
      groups.set(tag, [...(groups.get(tag) ?? []), node]);
   }
   return groups;
}

function toFinding(
   rule: AxeRuleResult,
   group: { criterion: string; tag: string; nodes: readonly AxeNodeResult[] },
): AxeFinding {
   const { criterion, tag, nodes } = group;
   const selectors = nodes.map((node) => node.target.join(' '));
   const more = selectors.length - LOCATION_LIMIT;
   return {
      criterion,
      key: `axe:${rule.id}:${tag}`,
      title: `${rule.help} (<${tag}>)`,
      severity: rule.impact ?? 'moderate',
      description: `${rule.description}. Detected by the axe-core rule "${rule.id}".`,
      impact: `People who rely on assistive technology or adapted presentation cannot perceive or operate the affected elements as intended (axe-core rates this ${rule.impact ?? 'moderate'}).`,
      recommendation: describeFix(nodes[0]?.failureSummary ?? '', rule.helpUrl),
      location: selectors.slice(0, LOCATION_LIMIT).join(', '),
      selector: selectors[0] ?? 'body',
      detail:
         more > 0
            ? `${String(selectors.length)} elements; ${String(more)} more not listed`
            : `${String(selectors.length)} ${selectors.length === 1 ? 'element' : 'elements'}`,
   };
}

/**
 * Turns axe violations into findings for the criteria in scope, one per rule, criterion,
 * and failing element type. A violation is the only scanner output treated as a decision;
 * passes and incomplete checks are not.
 */
export function listAxeFindings(
   result: AxeRunResult,
   scope: readonly string[],
): AxeFinding[] {
   return result.violations.flatMap((rule) =>
      getCriteriaFromAxeTags(rule.tags)
         .filter((criterion) => scope.includes(criterion))
         .flatMap((criterion) =>
            [...groupNodesByTag(rule)].map(([tag, nodes]) =>
               toFinding(rule, { criterion, tag, nodes }),
            ),
         ),
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
