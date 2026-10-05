import {
   axeRunResultSchema,
   type AxeRunResult,
   type WcagVersion,
} from '@a11ied/contracts';

import { parseWcagVersion } from '../wcag/parsing.js';
import type { DocumentLoad } from '../targets/parse.js';
import {
   executeAxeScan,
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

/** Describes a load target for reporting: the URL it navigated to, or a fixed label. */
function describeLoad(load: DocumentLoad): string {
   if (load.kind === 'goto') {
      return load.url;
   }
   return 'inline-html';
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

function resolveAxeInput(options: AxeRunOptions): {
   wcagVersion: WcagVersion;
   selection: AxeRunResult['selection'];
   ruleIds: string[];
} {
   const wcagVersion = parseWcagVersion(options.wcagVersion);
   const { selection, ruleIds } = resolveAxeSelection(options, wcagVersion);
   return {
      wcagVersion,
      selection,
      ruleIds,
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
   const resolved = resolveAxeInput(options);
   const { raw, warnings } = await executeAxeScan(load, resolved.ruleIds, options);
   return buildParsedAxeResult({
      reportUrl: describeLoad(load),
      wcagVersion: resolved.wcagVersion,
      selection: resolved.selection,
      ruleIds: resolved.ruleIds,
      raw,
      warnings,
   });
}
