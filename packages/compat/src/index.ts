export type {
   BrowserFamily,
   BrowserslistResolveOptions,
   BrowserslistTarget,
   CompatibilityCheckOptions,
   CompatibilityDiagnostic,
   CompatibilityReport,
   CompatibilitySummary,
   DiagnosticCode,
   DiagnosticEnvironmentImpact,
   DiagnosticSeverity,
   EnvironmentQueryFilter,
   FeatureCompatibilityResult,
   FeatureQueryFilter,
   FeatureSupportStatus,
   FeatureUsage,
   FeatureUsageInput,
   MatchPrecision,
   MatchedEnvironmentSummary,
   MatchedEnvironmentSupport,
   ResolvedBrowserslistResult,
   ResolvedFeatureQuery,
   SourceLocation,
   TargetPlatform,
   TestCaseOutcomesResult,
   TestCaseQueryFilter,
   UnifiedEnvironment,
   UntestedTargetGap,
} from './types.js';

export { normalizeFeatureUsage, resolveFeatureReport } from './normalize.js';

export {
   classifyEnvironmentBrowser,
   classifyEnvironmentPlatform,
   compareVersionTuples,
   normalizeScreenReaderName,
   parseBrowserslistEntry,
   parseVersionTuple,
   resolveBrowserslistTargets,
   type ParsedVersionTuple,
} from './browserslist.js';

export {
   getFeature,
   getTestCaseOutcomes,
   listSupportedFeatures,
   queryEnvironments,
   queryTestCases,
} from './query.js';

export {
   matchFeatureToTargets,
   type MatchFeatureOptions,
   type MatchFeatureResult,
} from './matching.js';

export { checkCompatibility, checkFeatureSupport } from './check.js';
