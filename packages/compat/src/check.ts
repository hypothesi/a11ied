import type { AssertionPriority } from '@a11ied/support-data';
import { resolveBrowserslistTargets } from './browserslist.js';
import { matchFeatureToTargets } from './matching.js';
import { normalizeFeatureUsage, resolveFeatureReport } from './normalize.js';
import type {
   BrowserslistTarget,
   CompatibilityCheckOptions,
   CompatibilityDiagnostic,
   CompatibilityReport,
   CompatibilitySummary,
   DiagnosticCode,
   DiagnosticEnvironmentImpact,
   DiagnosticSeverity,
   FeatureCompatibilityResult,
   FeatureSupportStatus,
   FeatureUsageInput,
   MatchedEnvironmentSupport,
   ResolvedFeatureQuery,
   SourceLocation,
} from './types.js';

function determineFeatureStatus(
   matched: readonly MatchedEnvironmentSupport[],
): FeatureSupportStatus {
   if (matched.length === 0) {
      return 'untested';
   }
   if (matched.some((item) => item.outcome === 'fail')) {
      return 'unsupported';
   }
   if (matched.some((item) => item.outcome === 'partial')) {
      return 'partial';
   }
   return 'supported';
}

function toEnvironmentImpact(
   item: MatchedEnvironmentSupport,
): DiagnosticEnvironmentImpact {
   return {
      targetRaw: item.target.raw,
      matchPrecision: item.matchPrecision,
      source: item.environment.source,
      screenReader: item.environment.screenReader,
      screenReaderVersion: item.environment.screenReaderVersion,
      browser: item.environment.browser,
      browserVersion: item.environment.browserVersion,
      browserType: item.environment.browserType,
      os: item.environment.os,
      osVersion: item.environment.osVersion,
      device: item.environment.device,
      summary: item.summary,
      failingAssertions: item.failingAssertions,
      sideEffects: item.sideEffects,
      bugs: item.bugs,
   };
}

function formatImpactLabel(impact: DiagnosticEnvironmentImpact): string {
   return `${impact.screenReader} ${impact.screenReaderVersion} + ${impact.browser} ${impact.browserVersion} (${impact.os} ${impact.osVersion})`;
}

interface DiagnosticBuildInput {
   readonly result: FeatureCompatibilityResult;
   readonly minPriority: AssertionPriority;
   readonly reportUntested: boolean;
   readonly reportUnknownFeatures: boolean;
}

interface IssueRuleSpec {
   readonly code: DiagnosticCode;
   readonly severity: DiagnosticSeverity;
   readonly label: string;
   readonly predicate: (item: MatchedEnvironmentSupport) => boolean;
}

function buildActiveIssueRules(minPriority: AssertionPriority): readonly IssueRuleSpec[] {
   const rules: IssueRuleSpec[] = [
      {
         code: 'a11ied/must-failure',
         severity: 'error',
         label: 'fails RFC 2119 MUST requirements',
         predicate: (item) => item.summary.must.failed > 0,
      },
      {
         code: 'a11ied/severe-side-effect',
         severity: 'error',
         label: 'causes SEVERE screen reader side effects',
         predicate: (item) => item.summary.severeSideEffects > 0,
      },
   ];

   if (minPriority !== 'MUST') {
      rules.push(
         {
            code: 'a11ied/should-failure',
            severity: 'warning',
            label: 'fails RFC 2119 SHOULD requirements',
            predicate: (item) => item.summary.should.failed > 0,
         },
         {
            code: 'a11ied/moderate-side-effect',
            severity: 'warning',
            label: 'causes MODERATE screen reader side effects',
            predicate: (item) => item.summary.moderateSideEffects > 0,
         },
      );
   }

   if (minPriority === 'MAY') {
      rules.push({
         code: 'a11ied/may-failure',
         severity: 'info',
         label: 'fails RFC 2119 MAY recommendations',
         predicate: (item) => item.summary.may.failed > 0,
      });
   }

   return rules;
}

function buildUsageContextFields(usage: ResolvedFeatureQuery): {
   readonly location?: SourceLocation;
   readonly element?: string;
} {
   return {
      ...(usage.location === undefined ? {} : { location: usage.location }),
      ...(usage.element === undefined ? {} : { element: usage.element }),
   };
}

function buildFeatureLinkFields(result: FeatureCompatibilityResult): {
   readonly specURL?: string;
   readonly docsPath?: string;
} {
   return {
      ...(result.specURL ? { specURL: result.specURL } : {}),
      ...(result.docsPath ? { docsPath: result.docsPath } : {}),
   };
}

function createDiagnosticFromRule(
   result: FeatureCompatibilityResult,
   rule: IssueRuleSpec,
   matchingItems: readonly MatchedEnvironmentSupport[],
): CompatibilityDiagnostic {
   const impacts = matchingItems.map((item) => toEnvironmentImpact(item));
   const preview = impacts.slice(0, 1).map((item) => formatImpactLabel(item));
   const extraCount = impacts.length - preview.length;
   const envPhrase =
      extraCount > 0
         ? `${preview.join(', ')} (+${String(extraCount)} more)`
         : preview.join(', ');

   return {
      code: rule.code,
      severity: rule.severity,
      featureKey: result.featureKey,
      ...(result.feature ? { featureType: result.feature.type } : {}),
      featureRef: result.feature?.refId ?? result.usage.featureRef,
      message: `${result.featureKey} ${rule.label} in ${envPhrase}.`,
      ...buildUsageContextFields(result.usage),
      ...buildFeatureLinkFields(result),
      affectedEnvironments: impacts,
   };
}

function buildUnknownFeatureDiagnostic(
   result: FeatureCompatibilityResult,
): CompatibilityDiagnostic {
   return {
      code: 'a11ied/unknown-feature',
      severity: 'info',
      featureKey: result.featureKey,
      ...(result.usage.type === undefined ? {} : { featureType: result.usage.type }),
      featureRef: result.usage.featureRef,
      message: `Feature "${result.usage.raw}" is not currently tracked in @a11ied/support-data.`,
      ...buildUsageContextFields(result.usage),
      affectedEnvironments: [],
   };
}

function buildUntestedTargetDiagnostic(
   result: FeatureCompatibilityResult,
): CompatibilityDiagnostic {
   const targetList = result.untestedTargets
      .map((gap) => `${gap.target.raw} (${gap.screenReader})`)
      .join(', ');
   return {
      code: 'a11ied/untested-target',
      severity: 'info',
      featureKey: result.featureKey,
      ...(result.feature ? { featureType: result.feature.type } : {}),
      featureRef: result.feature?.refId ?? result.usage.featureRef,
      message: `${result.featureKey} has untested Browserslist target combinations: ${targetList}.`,
      ...buildUsageContextFields(result.usage),
      ...buildFeatureLinkFields(result),
      affectedEnvironments: [],
   };
}

function buildUnknownOrUntestedDiagnostic(
   input: DiagnosticBuildInput,
): CompatibilityDiagnostic | undefined {
   const { result } = input;
   if (result.status === 'unknown-feature' && input.reportUnknownFeatures) {
      return buildUnknownFeatureDiagnostic(result);
   }

   if (input.reportUntested && result.untestedTargets.length > 0) {
      return buildUntestedTargetDiagnostic(result);
   }

   return undefined;
}

function buildDiagnosticsForResult(
   input: DiagnosticBuildInput,
): readonly CompatibilityDiagnostic[] {
   const diagnostics: CompatibilityDiagnostic[] = [];
   const { result } = input;

   if (result.feature) {
      for (const rule of buildActiveIssueRules(input.minPriority)) {
         const offending = result.matchedEnvironments.filter((item) =>
            rule.predicate(item),
         );
         if (offending.length > 0) {
            diagnostics.push(createDiagnosticFromRule(result, rule, offending));
         }
      }
   }

   const fallbackDiagnostic = buildUnknownOrUntestedDiagnostic(input);
   if (fallbackDiagnostic) {
      diagnostics.push(fallbackDiagnostic);
   }

   return diagnostics;
}

function buildMatchFilterOptions(options?: Omit<CompatibilityCheckOptions, 'usages'>): {
   readonly includeWebViews?: boolean;
   readonly includeVirtual?: boolean;
   readonly screenReaders?: readonly string[];
   readonly versionMatching?: 'nearest' | 'exact';
} {
   return {
      ...(options?.includeWebViews === undefined
         ? {}
         : { includeWebViews: options.includeWebViews }),
      ...(options?.includeVirtual === undefined
         ? {}
         : { includeVirtual: options.includeVirtual }),
      ...(options?.screenReaders === undefined
         ? {}
         : { screenReaders: options.screenReaders }),
      ...(options?.versionMatching === undefined
         ? {}
         : { versionMatching: options.versionMatching }),
   };
}

function checkResolvedUsage(
   usage: ResolvedFeatureQuery,
   targets: readonly BrowserslistTarget[],
   options?: Omit<CompatibilityCheckOptions, 'usages'>,
): FeatureCompatibilityResult {
   const feature = resolveFeatureReport(usage);
   if (!feature) {
      const fallbackKey = usage.type
         ? `${usage.type}:${usage.featureRef}`
         : usage.featureRef;
      return {
         usage,
         featureKey: fallbackKey,
         status: 'unknown-feature',
         matchedEnvironments: [],
         untestedTargets: [],
      };
   }

   const matched = matchFeatureToTargets({
      feature,
      targets,
      ...buildMatchFilterOptions(options),
   });

   return {
      usage,
      feature,
      featureKey: feature.key,
      status: determineFeatureStatus(matched.matchedEnvironments),
      docsPath: `/compatibility/features/${feature.type}/${feature.refId}/`,
      ...(feature.specURL ? { specURL: feature.specURL } : {}),
      matchedEnvironments: matched.matchedEnvironments,
      untestedTargets: matched.untestedTargets,
   };
}

/** Checks a single HTML/ARIA/CSS/JS feature against Browserslist targets. */
export function checkFeatureSupport(
   usageInput: FeatureUsageInput,
   options?: Omit<CompatibilityCheckOptions, 'usages'>,
): FeatureCompatibilityResult {
   const resolvedTargets = resolveBrowserslistTargets(options);
   const usage = normalizeFeatureUsage(usageInput);
   return checkResolvedUsage(usage, resolvedTargets.targets, options);
}

function summarizeReport(
   usagesChecked: number,
   diagnostics: readonly CompatibilityDiagnostic[],
): CompatibilitySummary {
   let errors = 0;
   let warnings = 0;
   let infos = 0;

   for (const item of diagnostics) {
      if (item.severity === 'error') {
         errors += 1;
      } else if (item.severity === 'warning') {
         warnings += 1;
      } else {
         infos += 1;
      }
   }

   return {
      usagesChecked,
      errors,
      warnings,
      infos,
      hasErrors: errors > 0,
      hasIssues: errors + warnings > 0,
   };
}

/**
 * Evaluates a list of feature usages (HTML attributes, ARIA roles/attributes, CSS, or JS)
 * against a Browserslist query and emits lint/IDE-ready diagnostics with exact versioned
 * screen reader environment metadata.
 */
export function checkCompatibility(
   options: CompatibilityCheckOptions,
): CompatibilityReport {
   const resolvedTargets = resolveBrowserslistTargets(options);
   const minPriority: AssertionPriority = options.minPriority ?? 'SHOULD';
   const reportUntested = options.reportUntested ?? false;
   const reportUnknownFeatures = options.reportUnknownFeatures ?? false;

   const results: FeatureCompatibilityResult[] = [];
   const diagnostics: CompatibilityDiagnostic[] = [];

   for (const usageInput of options.usages) {
      const usage = normalizeFeatureUsage(usageInput);
      const result = checkResolvedUsage(usage, resolvedTargets.targets, options);
      results.push(result);
      diagnostics.push(
         ...buildDiagnosticsForResult({
            result,
            minPriority,
            reportUntested,
            reportUnknownFeatures,
         }),
      );
   }

   return {
      browserslistQuery: resolvedTargets.query,
      targets: resolvedTargets.targets,
      results,
      diagnostics,
      summary: summarizeReport(options.usages.length, diagnostics),
   };
}
