import {
   axeRunResultSchema,
   type AxeRuleResult,
   type AxeRunResult,
   type WcagLevel,
   type WcagVersion,
} from '@a11lied/contracts';
import axe from 'axe-core';

import { CliUsageError } from '../errors/cli-errors.js';
import { getCoverage, listCriteriaByLevel } from '@a11lied/wcag-engine';
import { withLoadedPage } from '../browser/helper.js';

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
      impact: rule.impact ?? undefined,
      description: rule.description,
      help: rule.help,
      helpUrl: rule.helpUrl,
      tags: rule.tags ?? [],
      nodes:
         rule.nodes?.map((node) => ({
            target: node.target ?? [],
            html: node.html ?? '',
            failureSummary: node.failureSummary ?? undefined,
         })) ?? [],
   };
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

function parseAxeUrl(url: string): URL {
   try {
      return new URL(url);
   } catch {
      throw new CliUsageError('invalid-url', `URL "${url}" is invalid.`, { url });
   }
}

function resolveCriterionSelection(
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

function resolveLevelSelection(
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

function resolveRuleSelection(ruleIds: string[]): {
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

function resolveAxeSelection(
   options: AxeRunOptions,
   wcagVersion: WcagVersion,
): { selection: AxeRunResult['selection']; ruleIds: string[] } {
   if ('criterion' in options && options.criterion) {
      return resolveCriterionSelection(options.criterion, wcagVersion);
   }

   if ('level' in options && options.level) {
      return resolveLevelSelection(options.level, wcagVersion);
   }

   if ('ruleIds' in options && options.ruleIds) {
      return resolveRuleSelection(options.ruleIds);
   }

   throw new CliUsageError(
      'missing-selection',
      'Choose exactly one of --criterion, --level, or --rule.',
   );
}

async function executeAxeScan(parsedUrl: URL, ruleIds: string[]): Promise<RawAxeResults> {
   return withLoadedPage(parsedUrl.toString(), async (page) => {
      await page.addScriptTag({ content: axeScriptSource });

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
               runOnly: { type: 'rule', values },
            });
         },
         { values: ruleIds },
      );
   });
}

export async function runAxe(url: string, options: AxeRunOptions): Promise<AxeRunResult> {
   const parsedUrl = parseAxeUrl(url);
   const wcagVersion = parseWcagVersion(options.wcagVersion);
   const { selection, ruleIds } = resolveAxeSelection(options, wcagVersion);
   const raw = await executeAxeScan(parsedUrl, ruleIds);

   return axeRunResultSchema.parse({
      url: parsedUrl.toString(),
      wcagVersion,
      selection,
      ruleIds,
      violations: (raw.violations ?? []).map((rule) => normalizeRule(rule)),
      passes: (raw.passes ?? []).map((rule) => normalizeRule(rule)),
      incomplete: (raw.incomplete ?? []).map((rule) => normalizeRule(rule)),
      inapplicable: (raw.inapplicable ?? []).map((rule) => normalizeRule(rule)),
   });
}
