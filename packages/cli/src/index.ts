export {
   attachDocumentToDriverSession,
   cleanupStaleDriverSessions,
   createDoctorReport,
   DriverCommandError,
   driverCommandSets,
   getActiveSessionFile,
   getDriverSessionStatus,
   getDriverSocketPath,
   inspectRelevantCriteriaTarget,
   inspectRelevantCriteriaUrl,
   inspectCriterionTarget,
   inspectCriterionUrl,
   isDriverCommandSet,
   listCliCommands,
   listDriverCommands,
   listSupportedTargets,
   listWcagCriteria,
   openUrlInSystemAutomationBrowser,
   parseDriverCommandSet,
   renderDoctorText,
   resolveAvailableDefaultTarget,
   resolveDefaultTarget,
   resolveDocumentTarget,
   resolveDriverCommand,
   resolveTargetType,
   runAxe,
   runDriverSessionAction,
   runEphemeralDriverAction,
   searchWcagCriteria,
   showWcagTestMethod,
   showWcagCriterion,
   startDriverSession,
   stopDriverSession,
   CliEnvironmentError,
   CliUsageError,
} from '@a11ied/core';

export type {
   AxeRunOptions,
   ConcreteDriverCommandSet,
   DriverCommandList,
   DriverCommandSet,
   ListDriverCommandsOptions,
   ResolveDocumentTargetInput,
   SerializableDriverCommand,
   TargetType,
} from '@a11ied/core';

export {
   buildDriverTranscript,
   DEFAULT_IDLE_TIMEOUT_MINUTES,
   DRIVER_MODE_ENV_VAR,
   formatTranscript,
   getActiveDriverSession,
   getPortableCommand,
   portableCommandTable,
   resolveDriverMode,
   resolveRecordingTranscriptPath,
   resolveStateRoot,
   resolveTranscriptFormat,
   selectTranscriptEntries,
   showWcagAxeRule,
   showWcagTestMethodSummary,
   showWcagTechnique,
   STATE_DIR_ENV_VAR,
   writeDriverTranscript,
} from '@a11ied/core';

export type {
   DriverRequestOptions,
   DriverSessionStart,
   EphemeralDriverActionOptions,
   PortableCommandEntry,
   StartDriverSessionOptions,
   TranscriptSelection,
} from '@a11ied/core';

export {
   describeExpectationFailure,
   describeMatcher,
   describeNavigation,
   evaluateExpectation,
   getNavigationKindEntry,
   matchesText,
   navigationKindTable,
   parseTextMatcher,
} from '@a11ied/core';

export type {
   ExpectationOptions,
   ExpectationResult,
   NavigationKindEntry,
   TextMatcher,
} from '@a11ied/core';

export { runDriverSessionBatch } from '@a11ied/core';

export type {
   BatchRunOptions,
   BatchRunResult,
   BatchStepError,
   BatchStepOutcome,
   BatchStepResult,
} from '@a11ied/core';

export {
   isFrontmostMatch,
   openUrlInBrowser,
   resolveBrowserChoice,
   waitForWindowFocus,
   WINDOW_FOCUS_TIMEOUT_MS,
} from '@a11ied/core';

export type { BrowserChoice, FrontmostWindow, WindowFocusResult } from '@a11ied/core';

export {
   startAuditAssessment,
   nextAuditAssessment,
   getAuditAssessmentStatus,
   resumeAuditAssessment,
   finalizeAuditAssessment,
   registerAuditState,
   registerAuditJourney,
   queueAssessmentCheck,
   transitionAssessmentCheck,
   getAuditRunPaths,
   recordEvidence,
   readEvidence,
} from '@a11ied/core';

export type { AuditAssessmentStatus, CreateAuditRunOptions } from '@a11ied/core';
export {
   buildAuditReport,
   withLoadedPage,
   withInteractiveBrowserPage,
   type AuditReport,
   type BuildAuditReportInput,
   type WithBrowserPageOptions,
} from '@a11ied/core';
export { review, REVIEW_OPERATIONS } from '@a11ied/review';
export type {
   ActionableReviewItem,
   JudgeReviewInput,
   JudgeReviewResult,
   JudgeVerdictInput,
   NeedsReviewItem,
   NextReviewInput,
   NextReviewResult,
   ObservationBundleSliceName,
   ObserveReviewInput,
   ObserveReviewResult,
   ReportReviewInput,
   ReportReviewResult,
   ReviewCheckItem,
   ReviewCoverageSummary,
   ReviewOperation,
   ReviewRunState,
   ReviewStateRecord,
   ReviewTargetStateInput,
   RunReviewInput,
   RunReviewResult,
   StartReviewInput,
   StartReviewResult,
   StateClaimLease,
   StateReviewPacket,
   StatusReviewInput,
   StatusReviewResult,
} from '@a11ied/review';
