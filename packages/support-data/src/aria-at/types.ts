import type {
   AssertionResultRecord,
   AssertionSummary,
   SideEffectRecord,
} from '../types.js';

export interface AriaAtCommandSpec {
   readonly text: string;
   readonly mode: string;
}

export interface AriaAtCommandResult {
   readonly commands: readonly AriaAtCommandSpec[];
   readonly output: string;
   readonly untestable: boolean;
   readonly assertions: readonly AssertionResultRecord[];
   readonly negativeSideEffects: readonly SideEffectRecord[];
}

export interface AriaAtTestResult {
   readonly testTitle: string;
   readonly rowNumber: number;
   readonly renderedUrl?: string;
   readonly completedAt?: string;
   readonly atVersion: string;
   readonly browserVersion: string;
   readonly commandResults: readonly AriaAtCommandResult[];
}

export interface AriaAtEnvironmentReport {
   readonly reportID: string;
   readonly markedFinalAt?: string;
   readonly atKey: string;
   readonly atName: string;
   readonly atVersion: string;
   readonly browserKey: string;
   readonly browserName: string;
   readonly browserVersion: string;
   readonly os: string;
   readonly osVersion: string;
   readonly device: string;
   readonly summary: AssertionSummary;
   readonly tests: readonly AriaAtTestResult[];
}

export interface AriaAtFeatureRef {
   readonly refId: string;
   readonly type: 'aria' | 'html';
   readonly linkText: string;
   readonly specURL: string;
}

export interface AriaAtPlanFile {
   readonly schemaVersion: 1;
   readonly planVersionID: string;
   readonly slug: string;
   readonly directory: string;
   readonly title: string;
   readonly versionString: string;
   readonly phase: string;
   readonly gitSha: string;
   readonly updatedAt: string;
   readonly exampleURL?: string;
   readonly designPatternURL?: string;
   readonly upstreamURL: string;
   readonly featureRefs: readonly AriaAtFeatureRef[];
   readonly reports: readonly AriaAtEnvironmentReport[];
}

export interface AriaAtFeatureSummary {
   readonly refId: string;
   readonly type: 'aria' | 'html';
   readonly linkText: string;
   readonly specURL: string;
   readonly total: number;
   readonly passed: number;
   readonly failed: number;
   readonly untestable: number;
   readonly passedPercentage: number;
   readonly planSlugs: readonly string[];
}

export interface AriaAtPlanSummary {
   readonly slug: string;
   readonly directory: string;
   readonly title: string;
   readonly versionString: string;
   readonly phase: string;
   readonly planVersionID: string;
   readonly reportsCount: number;
   readonly featureRefs: readonly string[];
}

export interface AriaAtSummaryFile {
   readonly schemaVersion: 1;
   readonly syncedAt: string;
   readonly upstreamURL: string;
   readonly license: string;
   readonly plansCount: number;
   readonly reportsCount: number;
   readonly features: readonly AriaAtFeatureSummary[];
   readonly plans: readonly AriaAtPlanSummary[];
}
