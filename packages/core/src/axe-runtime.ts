import {
   axeRunResultSchema,
   type AxeRuleResult,
   type AxeRunResult,
   type WcagLevel,
   type WcagVersion,
} from '@a11lied/contracts';
import axe from 'axe-core';

import { CliUsageError } from './wcag-runtime.js';
import { getCoverage, listCriteriaByLevel } from '@a11lied/wcag-engine';
import { withLoadedPage } from './browser-helper.js';

type AxeRunOptions =
   | {
        url: string;
        wcagVersion: string;
        criterion: string;
        level?: undefined;
        ruleIds?: undefined;
     }
   | {
        url: string;
        wcagVersion: string;
        criterion?: undefined;
        level: string;
        ruleIds?: undefined;
     }
   | {
        url: string;
        wcagVersion: string;
        criterion?: undefined;
        level?: undefined;
        ruleIds: string[];
     };

interface RawAxeNode {
   target?: string[];
   html?: string;
   failureSummary?: string;
}

interface RawAxeRule {
   id: string;
   impact?: 'minor' | 'moderate' | 'serious' | 'critical' | null;
   description: string;
   help: string;
   helpUrl: string;
   tags?: string[];
   nodes?: RawAxeNode[];
}

interface RawAxeResults {
   violations?: RawAxeRule[];
   passes?: RawAxeRule[];
   incomplete?: RawAxeRule[];
   inapplicable?: RawAxeRule[];
}

const axeScriptSource = axe.source;

const levelOrdering: Record<WcagLevel, number> = {
   A: 1,
   AA: 2,
   AAA: 3,
};

function parseWcagVersion(version: string): WcagVersion {
   if (version === '2.1' || version === '2.2') {
      return version;
   }

   throw new CliUsageError(
      'validation-error',
      `WCAG version "${version}" is unsupported.`,
      {
         field: 'version',
         value: version,
         supportedVersions: ['2.2', '2.1'],
      },
   );
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

function normalizeRule(rule: RawAxeRule): AxeRuleResult {
   return {
      id: rule.id,
      impact: rule.impact ?? null,
      description: rule.description,
      help: rule.help,
      helpUrl: rule.helpUrl,
      tags: rule.tags ?? [],
      nodes:
         rule.nodes?.map((node) => ({
            target: node.target ?? [],
            html: node.html ?? '',
            failureSummary: node.failureSummary ?? null,
         })) ?? [],
   };
}

function unique(values: Iterable<string>): string[] {
   return [...new Set(values)].toSorted();
}

function resolveLevelRuleIds(level: WcagLevel, version: WcagVersion): string[] {
   const criteria = (['A', 'AA', 'AAA'] as const)
      .filter((entry) => levelOrdering[entry] <= levelOrdering[level])
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

export async function runAxe(url: string, options: AxeRunOptions): Promise<AxeRunResult> {
   let parsedUrl: URL;
   try {
      parsedUrl = new URL(url);
   } catch {
      throw new CliUsageError('invalid-url', `URL "${url}" is invalid.`, { url });
   }

   const wcagVersion = parseWcagVersion(options.wcagVersion);

   let selection: AxeRunResult['selection'];
   let ruleIds: string[];

   if ('criterion' in options && options.criterion) {
      ruleIds = ensureRuleIds(resolveCriterionRuleIds(options.criterion, wcagVersion), {
         criterion: options.criterion,
         wcagVersion,
      });
      selection = {
         kind: 'criterion',
         criterion: options.criterion,
         resolvedRuleIds: ruleIds,
      };
   } else if ('level' in options && options.level) {
      const parsedLevel = parseLevel(options.level);
      ruleIds = ensureRuleIds(resolveLevelRuleIds(parsedLevel, wcagVersion), {
         level: parsedLevel,
         wcagVersion,
      });
      selection = {
         kind: 'level',
         level: parsedLevel,
         resolvedRuleIds: ruleIds,
      };
   } else if ('ruleIds' in options && options.ruleIds) {
      ruleIds = ensureRuleIds(options.ruleIds, {
         ruleIds: options.ruleIds,
      });
      selection = {
         kind: 'rule',
         ruleIds,
      };
   } else {
      throw new CliUsageError(
         'missing-selection',
         'Choose exactly one of --criterion, --level, or --rule.',
      );
   }

   const raw = await withLoadedPage(parsedUrl.toString(), async (page) => {
      await page.addScriptTag({
         content: axeScriptSource,
      });

      return await page.evaluate(
         async ({ values }) => {
            const axeRef = (
               globalThis as typeof globalThis & {
                  axe: {
                     run: (context: Document, options: unknown) => Promise<RawAxeResults>;
                  };
               }
            ).axe;
            return await axeRef.run(document, {
               runOnly: {
                  type: 'rule',
                  values,
               },
            });
         },
         { values: ruleIds },
      );
   });

   return axeRunResultSchema.parse({
      url: parsedUrl.toString(),
      wcagVersion,
      selection,
      ruleIds,
      violations: (raw.violations ?? []).map(normalizeRule),
      passes: (raw.passes ?? []).map(normalizeRule),
      incomplete: (raw.incomplete ?? []).map(normalizeRule),
      inapplicable: (raw.inapplicable ?? []).map(normalizeRule),
   });
}
