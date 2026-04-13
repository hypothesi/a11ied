import {
   axeRunResultSchema,
   type AxeRuleResult,
   type AxeRunResult,
   type WcagVersion,
} from '@a11ied/contracts';
import axe from 'axe-core';

import { CliUsageError } from '../errors/cli-errors.js';
import { withLoadedPage } from '../browser/helper.js';
import {
   resolveCriterionSelection,
   resolveLevelSelection,
   resolveRuleSelection,
} from './selection.js';

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

interface CachedAxeResult {
   ruleIds: string[];
   result: AxeRunResult;
}

const axeResultCache = new Map<string, CachedAxeResult>();

function buildAxeCacheKey(url: string, wcagVersion: WcagVersion): string {
   return `${url}::${wcagVersion}`;
}

function isSuperset(haystack: string[], needles: string[]): boolean {
   if (needles.length === 0) {
      return true;
   }
   const ruleSet = new Set(haystack);
   return needles.every((ruleId) => ruleSet.has(ruleId));
}

function filterAxeResult(
   cached: AxeRunResult,
   ruleIds: string[],
   selection: AxeRunResult['selection'],
): AxeRunResult {
   const ruleSet = new Set(ruleIds);
   const filterRules = (rules: AxeRuleResult[]): AxeRuleResult[] =>
      rules.filter((rule) => ruleSet.has(rule.id));
   return axeRunResultSchema.parse({
      ...cached,
      selection,
      ruleIds,
      violations: filterRules(cached.violations),
      passes: filterRules(cached.passes),
      incomplete: filterRules(cached.incomplete),
      inapplicable: filterRules(cached.inapplicable),
   });
}

function getCachedAxeResult(args: {
   cacheKey: string;
   ruleIds: string[];
   selection: AxeRunResult['selection'];
}): AxeRunResult | undefined {
   const cached = axeResultCache.get(args.cacheKey);
   if (cached && isSuperset(cached.ruleIds, args.ruleIds)) {
      return filterAxeResult(cached.result, args.ruleIds, args.selection);
   }
   return undefined;
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

function buildParsedAxeResult(args: {
   url: string;
   wcagVersion: WcagVersion;
   selection: AxeRunResult['selection'];
   ruleIds: string[];
   raw: RawAxeResults;
}): AxeRunResult {
   return axeRunResultSchema.parse({
      url: args.url,
      wcagVersion: args.wcagVersion,
      selection: args.selection,
      ruleIds: args.ruleIds,
      violations: (args.raw.violations ?? []).map((rule) => normalizeRule(rule)),
      passes: (args.raw.passes ?? []).map((rule) => normalizeRule(rule)),
      incomplete: (args.raw.incomplete ?? []).map((rule) => normalizeRule(rule)),
      inapplicable: (args.raw.inapplicable ?? []).map((rule) => normalizeRule(rule)),
   });
}

function updateAxeCache(args: {
   cacheKey: string;
   ruleIds: string[];
   result: AxeRunResult;
}): void {
   const cached = axeResultCache.get(args.cacheKey);
   if (!cached || isSuperset(args.ruleIds, cached.ruleIds)) {
      axeResultCache.set(args.cacheKey, { ruleIds: args.ruleIds, result: args.result });
   }
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

function parseAxeUrl(url: string): URL {
   try {
      return new URL(url);
   } catch {
      throw new CliUsageError('invalid-url', `URL "${url}" is invalid.`, { url });
   }
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

function resolveAxeInput(
   url: string,
   options: AxeRunOptions,
): {
   parsedUrl: URL;
   wcagVersion: WcagVersion;
   selection: AxeRunResult['selection'];
   ruleIds: string[];
   cacheKey: string;
} {
   const parsedUrl = parseAxeUrl(url);
   const wcagVersion = parseWcagVersion(options.wcagVersion);
   const { selection, ruleIds } = resolveAxeSelection(options, wcagVersion);
   return {
      parsedUrl,
      wcagVersion,
      selection,
      ruleIds,
      cacheKey: buildAxeCacheKey(parsedUrl.toString(), wcagVersion),
   };
}

/** Runs axe-core against one URL using a criterion, level, or explicit rule selection. */
export async function runAxe(url: string, options: AxeRunOptions): Promise<AxeRunResult> {
   const resolved = resolveAxeInput(url, options);
   const cached = getCachedAxeResult({
      cacheKey: resolved.cacheKey,
      ruleIds: resolved.ruleIds,
      selection: resolved.selection,
   });
   if (cached) {
      return cached;
   }
   const raw = await executeAxeScan(resolved.parsedUrl, resolved.ruleIds);
   const parsed = buildParsedAxeResult({
      url: resolved.parsedUrl.toString(),
      wcagVersion: resolved.wcagVersion,
      selection: resolved.selection,
      ruleIds: resolved.ruleIds,
      raw,
   });
   updateAxeCache({
      cacheKey: resolved.cacheKey,
      ruleIds: resolved.ruleIds,
      result: parsed,
   });
   return parsed;
}
