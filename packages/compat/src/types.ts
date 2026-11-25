import type { FeatureEnvironmentResult, FeatureReport } from '@a11ied/support-data';
import type {
   AssertionBugRef,
   AssertionPriority,
   AssertionResultRecord,
   AssertionSummary,
   FeatureType,
   PlatformGroup,
   ScreenReaderTestCase,
   SideEffectRecord,
   TestOutcome,
   TestRunRecord,
} from '@a11ied/support-data/types';

export type BrowserFamily =
   | 'chrome'
   | 'firefox'
   | 'safari'
   | 'edge'
   | 'webview'
   | 'other';

export type TargetPlatform =
   | 'desktop'
   | 'macos'
   | 'windows'
   | 'android'
   | 'ios'
   | 'other';

export type MatchPrecision = 'exact' | 'nearest-older' | 'nearest-newer';

export type FeatureSupportStatus =
   | 'supported'
   | 'partial'
   | 'unsupported'
   | 'untested'
   | 'unknown-feature';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
   | 'a11ied/must-failure'
   | 'a11ied/severe-side-effect'
   | 'a11ied/should-failure'
   | 'a11ied/moderate-side-effect'
   | 'a11ied/may-failure'
   | 'a11ied/untested-target'
   | 'a11ied/unknown-feature';

export interface SourceLocation {
   readonly file?: string;
   readonly line?: number;
   readonly column?: number;
   readonly endLine?: number;
   readonly endColumn?: number;
}

export interface FeatureUsage {
   readonly type?: FeatureType;
   readonly feature: string;
   readonly element?: string;
   readonly location?: SourceLocation;
}

export type FeatureUsageInput = string | FeatureUsage;

export interface ResolvedFeatureQuery {
   readonly raw: string;
   readonly type?: FeatureType;
   readonly featureRef: string;
   readonly element?: string;
   readonly location?: SourceLocation;
}

export interface BrowserslistTarget {
   readonly raw: string;
   readonly browserslistID: string;
   readonly browserFamily: BrowserFamily;
   readonly platform: TargetPlatform;
   readonly version: string;
   readonly majorVersion?: number;
   readonly minorVersion?: number;
   readonly expectedScreenReaders: readonly string[];
}

export interface BrowserslistResolveOptions {
   readonly browserslist?: string | readonly string[];
   readonly path?: string;
   readonly env?: string;
   readonly config?: string;
   readonly includeWebViews?: boolean;
   readonly screenReaders?: readonly string[];
}

export interface ResolvedBrowserslistResult {
   readonly query: string;
   readonly rawTargets: readonly string[];
   readonly targets: readonly BrowserslistTarget[];
}

export interface UnifiedEnvironment {
   readonly key: string;
   readonly id: string;
   readonly source: 'local' | 'w3c-aria-at';
   readonly status: 'tested' | 'untested';
   readonly statusNote?: string;
   readonly platformGroup?: PlatformGroup;
   readonly screenReader: string;
   readonly screenReaderFamily: string;
   readonly screenReaderVersion: string;
   readonly browser: string;
   readonly browserFamily: BrowserFamily;
   readonly browserVersion: string;
   readonly browserType: 'browser' | 'webview';
   readonly os: string;
   readonly osPlatform: TargetPlatform;
   readonly osVersion: string;
   readonly device: string;
   readonly runCount: number;
   readonly planCount: number;
   readonly latestTestedAt?: string;
}

export interface EnvironmentQueryFilter {
   readonly source?: 'local' | 'w3c-aria-at';
   readonly status?: 'tested' | 'untested';
   readonly browser?: BrowserFamily | string;
   readonly browserType?: 'browser' | 'webview';
   readonly os?: TargetPlatform | string;
   readonly screenReader?: string;
   readonly includeWebViews?: boolean;
   readonly includeVirtual?: boolean;
}

export interface FeatureQueryFilter {
   readonly type?: FeatureType;
   readonly sourceCoverage?: FeatureReport['sourceCoverage'];
   readonly search?: string;
}

export interface TestCaseQueryFilter {
   readonly category?: FeatureType;
   readonly attribute?: string;
   readonly tag?: string;
   readonly search?: string;
}

export interface MatchedEnvironmentSummary {
   readonly source: 'local' | 'w3c-aria-at';
   readonly environmentKey: string;
   readonly environmentID: string;
   readonly screenReader: string;
   readonly screenReaderVersion: string;
   readonly browser: string;
   readonly browserVersion: string;
   readonly browserType: 'browser' | 'webview';
   readonly os: string;
   readonly osVersion: string;
   readonly device: string;
   readonly testedAt?: string;
   readonly summary: AssertionSummary;
}

export interface MatchedEnvironmentSupport {
   readonly target: BrowserslistTarget;
   readonly environment: MatchedEnvironmentSummary;
   readonly rawEnvironment: FeatureEnvironmentResult;
   readonly matchPrecision: MatchPrecision;
   readonly outcome: TestOutcome;
   readonly summary: AssertionSummary;
   readonly failingAssertions: readonly AssertionResultRecord[];
   readonly sideEffects: readonly SideEffectRecord[];
   readonly bugs: readonly AssertionBugRef[];
}

export interface UntestedTargetGap {
   readonly target: BrowserslistTarget;
   readonly screenReader: string;
   readonly reason: string;
}

export interface FeatureCompatibilityResult {
   readonly usage: ResolvedFeatureQuery;
   readonly feature?: FeatureReport;
   readonly featureKey: string;
   readonly status: FeatureSupportStatus;
   readonly docsPath?: string;
   readonly specURL?: string;
   readonly matchedEnvironments: readonly MatchedEnvironmentSupport[];
   readonly untestedTargets: readonly UntestedTargetGap[];
}

export interface DiagnosticEnvironmentImpact {
   readonly targetRaw: string;
   readonly matchPrecision: MatchPrecision;
   readonly source: 'local' | 'w3c-aria-at';
   readonly screenReader: string;
   readonly screenReaderVersion: string;
   readonly browser: string;
   readonly browserVersion: string;
   readonly browserType: 'browser' | 'webview';
   readonly os: string;
   readonly osVersion: string;
   readonly device: string;
   readonly summary: AssertionSummary;
   readonly failingAssertions: readonly AssertionResultRecord[];
   readonly sideEffects: readonly SideEffectRecord[];
   readonly bugs: readonly AssertionBugRef[];
}

export interface CompatibilityDiagnostic {
   readonly code: DiagnosticCode;
   readonly severity: DiagnosticSeverity;
   readonly featureKey: string;
   readonly featureType?: FeatureType;
   readonly featureRef: string;
   readonly message: string;
   readonly location?: SourceLocation;
   readonly element?: string;
   readonly specURL?: string;
   readonly docsPath?: string;
   readonly affectedEnvironments: readonly DiagnosticEnvironmentImpact[];
}

export interface CompatibilityCheckOptions extends BrowserslistResolveOptions {
   readonly usages: readonly FeatureUsageInput[];
   readonly minPriority?: AssertionPriority;
   readonly includeVirtual?: boolean;
   readonly reportUntested?: boolean;
   readonly reportUnknownFeatures?: boolean;
   readonly versionMatching?: 'nearest' | 'exact';
}

export interface CompatibilitySummary {
   readonly usagesChecked: number;
   readonly errors: number;
   readonly warnings: number;
   readonly infos: number;
   readonly hasErrors: boolean;
   readonly hasIssues: boolean;
}

export interface CompatibilityReport {
   readonly browserslistQuery: string;
   readonly targets: readonly BrowserslistTarget[];
   readonly results: readonly FeatureCompatibilityResult[];
   readonly diagnostics: readonly CompatibilityDiagnostic[];
   readonly summary: CompatibilitySummary;
}

export interface TestCaseOutcomesResult {
   readonly testCase?: ScreenReaderTestCase;
   readonly runs: readonly TestRunRecord[];
}
