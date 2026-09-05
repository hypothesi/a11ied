import {
   axeRunResultSchema,
   type AxeRuleResult,
   type AxeRunResult,
   type WcagVersion,
} from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';
import type { DocumentLoad } from '../targets/parse.js';
import {
   executeAxeScan,
   hasCustomScanOptions,
   normalizeRule,
   type AxeScanOptions,
   type RawAxeResults,
} from './scan.js';
import {
   resolveCriterionSelection,
   resolveAllSelection,
   resolveLevelSelection,
   resolveRuleSelection,
} from './selection.js';

export type AxeRunOptions = { wcagVersion: string } & AxeScanOptions &
   (
      | { criterion?: undefined; level?: undefined; ruleIds?: undefined }
      | { criterion: string; level?: undefined; ruleIds?: undefined }
      | { criterion?: undefined; level: string; ruleIds?: undefined }
      | { criterion?: undefined; level?: undefined; ruleIds: string[] }
   );

interface CachedAxeResult {
   ruleIds: string[];
   result: AxeRunResult;
}

const axeResultCache = new Map<string, CachedAxeResult>();

/** Describes a load target for reporting: the URL it navigated to, or a fixed label. */
function describeLoad(load: DocumentLoad): string {
   if (load.kind === 'goto') {
      return load.url;
   }
   return 'inline-html';
}

/**
 * Builds a cache key for a load target, or undefined when the result should not be
 * cached.
 */
function buildAxeCacheKey(
   load: DocumentLoad,
   wcagVersion: WcagVersion,
   scanOptions: AxeScanOptions,
): string | undefined {
   if (load.kind === 'html' || hasCustomScanOptions(scanOptions)) {
      return undefined;
   }
   return `${load.url}::${wcagVersion}`;
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
   cacheKey: string | undefined;
   ruleIds: string[];
   selection: AxeRunResult['selection'];
}): AxeRunResult | undefined {
   if (!args.cacheKey) {
      return undefined;
   }
   const cached = axeResultCache.get(args.cacheKey);
   if (cached && isSuperset(cached.ruleIds, args.ruleIds)) {
      return filterAxeResult(cached.result, args.ruleIds, args.selection);
   }
   return undefined;
}

function buildParsedAxeResult(args: {
   reportUrl: string;
   wcagVersion: WcagVersion;
   selection: AxeRunResult['selection'];
   ruleIds: string[];
   raw: RawAxeResults;
   warnings?: string[];
}): AxeRunResult {
   return axeRunResultSchema.parse({
      url: args.reportUrl,
      wcagVersion: args.wcagVersion,
      selection: args.selection,
      ruleIds: args.ruleIds,
      violations: (args.raw.violations ?? []).map((rule) => normalizeRule(rule)),
      passes: (args.raw.passes ?? []).map((rule) => normalizeRule(rule)),
      incomplete: (args.raw.incomplete ?? []).map((rule) => normalizeRule(rule)),
      inapplicable: (args.raw.inapplicable ?? []).map((rule) => normalizeRule(rule)),
      warnings: args.warnings && args.warnings.length > 0 ? args.warnings : undefined,
   });
}

function updateAxeCache(args: {
   cacheKey: string | undefined;
   ruleIds: string[];
   result: AxeRunResult;
}): void {
   if (!args.cacheKey) {
      return;
   }
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

   return resolveAllSelection(wcagVersion);
}

function resolveAxeInput(
   load: DocumentLoad,
   options: AxeRunOptions,
): {
   wcagVersion: WcagVersion;
   selection: AxeRunResult['selection'];
   ruleIds: string[];
   cacheKey: string | undefined;
} {
   const wcagVersion = parseWcagVersion(options.wcagVersion);
   const { selection, ruleIds } = resolveAxeSelection(options, wcagVersion);
   return {
      wcagVersion,
      selection,
      ruleIds,
      cacheKey: buildAxeCacheKey(load, wcagVersion, options),
   };
}

/**
 * Runs axe-core against one resolved document target using a criterion, level, or
 * explicit rule selection. Loads the target directly in Playwright; it does not make a
 * separate network request first.
 */
export async function runAxe(
   load: DocumentLoad,
   options: AxeRunOptions,
): Promise<AxeRunResult> {
   const resolved = resolveAxeInput(load, options);
   const cached = getCachedAxeResult({
      cacheKey: resolved.cacheKey,
      ruleIds: resolved.ruleIds,
      selection: resolved.selection,
   });
   if (cached) {
      return cached;
   }
   const { raw, warnings } = await executeAxeScan(load, resolved.ruleIds, options);
   const parsed = buildParsedAxeResult({
      reportUrl: describeLoad(load),
      wcagVersion: resolved.wcagVersion,
      selection: resolved.selection,
      ruleIds: resolved.ruleIds,
      raw,
      warnings,
   });
   updateAxeCache({
      cacheKey: resolved.cacheKey,
      ruleIds: resolved.ruleIds,
      result: parsed,
   });
   return parsed;
}
