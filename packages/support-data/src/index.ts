import { resetAriaAtCache } from './aria-at/index.js';
import { resetFeaturesCache } from './features.js';
import { resetResultsCache } from './results/index.js';

export type {
   AssertionBugRef,
   AssertionPriority,
   AssertionResultRecord,
   AssertionSummary,
   AssertionVerdict,
   EnvironmentResultFile,
   FeatureRefEntry,
   FeatureType,
   PlatformGroup,
   PriorityCounts,
   ScreenReaderTestCase,
   SideEffectImpact,
   SideEffectRecord,
   SpecAssertion,
   SpecAssertionRule,
   SpecReference,
   TestCategory,
   TestEnvironment,
   TestEvaluationRule,
   TestInteractionMode,
   TestOutcome,
   TestRunRecord,
   TranscriptEntry,
} from './types.js';

export {
   buildEnvironmentKey,
   createEmptyPriorityCounts,
   deriveOutcomeFromSummary,
   formatCategoryLabel,
   formatOutcomeLabel,
   summarizeAssertions,
} from './types.js';

export type {
   AriaAtCommandResult,
   AriaAtCommandSpec,
   AriaAtEnvironmentReport,
   AriaAtFeatureRef,
   AriaAtFeatureSummary,
   AriaAtPlanFile,
   AriaAtPlanSummary,
   AriaAtSummaryFile,
   AriaAtTestResult,
} from './aria-at/types.js';

export {
   getAriaAtPlanBySlug,
   getAriaAtSummary,
   listAriaAtEnvironments,
   listAriaAtPlans,
   resetAriaAtCache,
   type AriaAtVersionedEnvironment,
} from './aria-at/index.js';

export {
   getTestCaseBySlug,
   listAttributes,
   listCategories,
   listTestCases,
   screenReaderTests,
} from './cases/index.js';

export { resolveCaseAssertions } from './assertions.js';

export {
   getSupportDataDirectories,
   resolveSupportDataRoot,
   type SupportDataDirectories,
} from './paths.js';

export {
   getRunForTestAndEnvironment,
   getRunsForTest,
   getSummaryCounts,
   listEnvironmentFiles,
   listEnvironments,
   resetResultsCache,
} from './results/index.js';

export {
   getFeatureReport,
   listFeatures,
   listFeatureSummaryForTestAttribute,
   resetFeaturesCache,
   type AriaAtFeatureDrilldownItem,
   type FeatureDrilldownItem,
   type FeatureEnvironmentResult,
   type FeatureReport,
   type LocalFeatureDrilldownItem,
} from './features.js';

/** Clears cached dataset indices so subsequent reads reload JSON files from disk. */
export function resetSupportDataCache(): void {
   resetAriaAtCache();
   resetResultsCache();
   resetFeaturesCache();
}
