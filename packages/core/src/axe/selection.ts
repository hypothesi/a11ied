import type { AxeRunResult, WcagLevel, WcagVersion } from '@a11ied/contracts';
import { getCoverage, listCriteriaByLevel } from '@a11ied/wcag-engine';

import { CliUsageError } from '../errors/cli-errors.js';

const LEVEL_ORDER_AA = 2;
const LEVEL_ORDER_AAA = 3;

function getLevelOrder(level: WcagLevel): number {
   if (level === 'AA') {
      return LEVEL_ORDER_AA;
   }
   if (level === 'AAA') {
      return LEVEL_ORDER_AAA;
   }
   return 1;
}

function parseLevel(level: string): WcagLevel {
   if (level === 'A' || level === 'AA' || level === 'AAA') {
      return level;
   }

   throw new CliUsageError('validation-error', `WCAG level "${level}" is unsupported.`, {
      field: 'level',
      value: level,
      supportedLevels: ['A', 'AA', 'AAA'],
   });
}

function unique(values: Iterable<string>): string[] {
   return [...new Set(values)].toSorted();
}

function resolveLevelRuleIds(level: WcagLevel, version: WcagVersion): string[] {
   const criteria = (['A', 'AA', 'AAA'] as const)
      .filter((entry) => getLevelOrder(entry) <= getLevelOrder(level))
      .flatMap((entry) => listCriteriaByLevel(entry, version).criteria);

   return unique(
      criteria.flatMap(
         (criterion) => getCoverage(criterion.id, { version }).coverage.axeRuleIds,
      ),
   );
}

function resolveCriterionRuleIds(criterion: string, version: WcagVersion): string[] {
   return getCoverage(criterion, { version }).coverage.axeRuleIds;
}

function ensureRuleIds(ruleIds: string[], context: Record<string, unknown>): string[] {
   const uniqueRuleIds = unique(ruleIds);
   if (uniqueRuleIds.length === 0) {
      throw new CliUsageError(
         'no-axe-rules',
         'No axe-core rules are mapped for this selection.',
         context,
      );
   }

   return uniqueRuleIds;
}

export function resolveCriterionSelection(
   criterion: string,
   wcagVersion: WcagVersion,
): { selection: AxeRunResult['selection']; ruleIds: string[] } {
   const ruleIds = ensureRuleIds(resolveCriterionRuleIds(criterion, wcagVersion), {
      criterion,
      wcagVersion,
   });
   return {
      selection: {
         kind: 'criterion',
         criterion,
         resolvedRuleIds: ruleIds,
      },
      ruleIds,
   };
}

export function resolveLevelSelection(
   level: string,
   wcagVersion: WcagVersion,
): { selection: AxeRunResult['selection']; ruleIds: string[] } {
   const parsedLevel = parseLevel(level);
   const ruleIds = ensureRuleIds(resolveLevelRuleIds(parsedLevel, wcagVersion), {
      level: parsedLevel,
      wcagVersion,
   });
   return {
      selection: {
         kind: 'level',
         level: parsedLevel,
         resolvedRuleIds: ruleIds,
      },
      ruleIds,
   };
}

export function resolveRuleSelection(ruleIds: string[]): {
   selection: AxeRunResult['selection'];
   ruleIds: string[];
} {
   const uniqueRuleIds = ensureRuleIds(ruleIds, { ruleIds });
   return {
      selection: {
         kind: 'rule',
         ruleIds: uniqueRuleIds,
      },
      ruleIds: uniqueRuleIds,
   };
}
