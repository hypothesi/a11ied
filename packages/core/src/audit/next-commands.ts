import type { AxeRunResult } from '@a11ied/contracts';
import { findApgExamplesByRole } from '@a11ied/wcag-engine';

import type { AuditCriterionRollup } from './criteria-rollup.js';

/** How many pattern suggestions to add, so the list stays short enough to read. */
const MAX_PATTERN_SUGGESTIONS = 3;

function dedupe(values: string[]): string[] {
   return [...new Set(values)];
}

function needsManualEvidence(criteria: AuditCriterionRollup[]): boolean {
   return criteria.some(
      (criterion) =>
         criterion.relevance === 'relevant' &&
         (criterion.testMethod === 'manual' || criterion.testMethod === 'hybrid'),
   );
}

/**
 * Suggests the ARIA patterns that document the roles this page actually uses.
 *
 * The link between a criterion and a pattern is not stored anywhere, because W3C
 * publishes no such mapping and a11ied does not invent one. This is derived from the page
 * in front of the user instead: a role in its accessibility tree, looked up in the APG's
 * own example index.
 */
function buildPatternCommands(roles: string[]): string[] {
   return roles
      .filter((role) => findApgExamplesByRole(role).length > 0)
      .slice(0, MAX_PATTERN_SUGGESTIONS)
      .map((role) => `a1 pattern role ${role}`);
}

/**
 * Lists the commands to run next: `a1 wcag rule <id>` for each failing axe rule, `a1 sr
 * walk <target>` when a relevant criterion still needs a person to test it, and `a1
 * pattern role <role>` for the ARIA roles the page uses that the APG documents.
 */
export function buildNextCommands(args: {
   axe: AxeRunResult;
   criteria: AuditCriterionRollup[];
   target: string;
   roles?: string[];
}): string[] {
   const commands = dedupe(args.axe.violations.map((rule) => rule.id)).map(
      (ruleId) => `a1 wcag rule ${ruleId}`,
   );

   if (needsManualEvidence(args.criteria)) {
      commands.push(`a1 sr walk ${args.target}`);
   }

   commands.push(...buildPatternCommands(args.roles ?? []));

   return commands;
}
