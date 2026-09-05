import type { AxeRunResult } from '@a11ied/contracts';
import type { AuditCriterionRollup } from './criteria-rollup.js';

function dedupe(values: string[]): string[] {
   return [...new Set(values)];
}

function needsManualEvidence(criteria: AuditCriterionRollup[]): boolean {
   return criteria.some(
      (criterion) =>
         criterion.applicability === 'applicable' &&
         (criterion.coverageState === 'manual' || criterion.coverageState === 'hybrid'),
   );
}

/**
 * Lists the commands to run next: `a1 wcag rule <id>` for each failing axe rule, and `a1
 * sr walk <target>` when an applicable criterion still needs manual evidence.
 */
export function buildNextCommands(args: {
   axe: AxeRunResult;
   criteria: AuditCriterionRollup[];
   target: string;
}): string[] {
   const commands = dedupe(args.axe.violations.map((rule) => rule.id)).map(
      (ruleId) => `a1 wcag rule ${ruleId}`,
   );

   if (needsManualEvidence(args.criteria)) {
      commands.push(`a1 sr walk ${args.target}`);
   }

   return commands;
}
