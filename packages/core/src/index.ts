export {
   CliEnvironmentError,
   CliUsageError,
   inspectRelevantCriteriaTarget,
   inspectRelevantCriteriaUrl,
   inspectCriterionTarget,
   inspectCriterionUrl,
   listWcagCriteria,
   searchWcagCriteria,
   showWcagTestMethod,
   showWcagCriterion,
} from './wcag/runtime.js';
export {
   attachDocumentToDriverSession,
   cleanupStaleDriverSessions,
   getActiveSessionFile,
   getDriverSocketPath,
   getDriverSessionStatus,
   runDriverSessionAction,
   runEphemeralDriverAction,
   setVoiceOverLivenessCheckerForTesting,
   startDriverSession,
   stopDriverSession,
} from './driver/runtime.js';
export {
   resolveAvailableDefaultTarget,
   resolveDefaultTarget,
   resolveTargetType,
} from './driver/default-target.js';
export type { TargetType } from './driver/default-target.js';
export {
   DriverCommandError,
   driverCommandSets,
   generateSrActionDescription,
   generateSrSessionDescription,
   getSrActionMetadata,
   getSrVerbMetadata,
   getVerbsForGroup,
   getRegisteredQueuedMethodNames,
   getRegisteredVitestMatcherNames,
   isDriverCommandSet,
   listDriverCommands,
   parseDriverCommandSet,
   resolveDriverCommand,
   SR_ACTION_ENUM_VALUES,
   SR_ACTION_METADATA,
   SR_TASK_GROUPS,
   SR_VERB_REGISTRY,
   type ConcreteDriverCommandSet,
   type DriverCommandList,
   type DriverCommandSet,
   type ListDriverCommandsOptions,
   type SerializableDriverCommand,
   type SrActionEnumValue,
   type SrActionMetadata,
   type SrTaskGroup,
   type SrVerbMetadata,
} from '@a11ied/guidepup';
export { runAxe, type AxeRunOptions } from './axe/runtime.js';
export { openUrlInSystemAutomationBrowser } from './browser/helper.js';
export {
   resolveDocumentTarget,
   type ResolveDocumentTargetInput,
} from './targets/runtime.js';
export {
   createDefaultDoctorDeps,
   createDoctorReport,
   listSupportedTargets,
   type DoctorDeps,
} from './doctor/runtime.js';
export { renderDoctorText, type DoctorTextStyle } from './doctor/render.js';
export {
   listGuidepupSetupSteps,
   runGuidepupSetup,
   type GuidepupSetupHooks,
   type GuidepupSetupOptions,
   type GuidepupSetupStep,
   type GuidepupSetupStepResult,
} from './doctor/setup.js';
export {
   DEFAULT_TARGET_TIMEOUT_MS,
   describeResolvedTarget,
   type ResolvedDocumentTarget,
} from './targets/runtime.js';
export type { DocumentLoad } from './targets/parse.js';
export {
   DEFAULT_FAIL_ON_IMPACT,
   buildBaselineFromViolations,
   evaluateAxeVerdict,
} from './axe/verdict.js';
export { buildAxeSarifLog, type AxeSarifLog } from './axe/sarif.js';
export {
   recordEvidence,
   clearEvidence,
   readEvidence,
   readEvidenceForSubject,
   type EvidenceStoreOptions,
} from './evidence/store.js';
export { EVIDENCE_FILE_ENV_VAR, resolveEvidenceFile } from './evidence/paths.js';
export {
   buildSubjectKey,
   hashAccessibilityTree,
   stripFragment,
} from './evidence/subject.js';
export {
   buildA11iedAssertor,
   buildAxeEarlReport,
   listAxeEarlAssertions,
   type AxeEarlReportOptions,
} from './axe/earl.js';
export { buildCheckEarlReport, type CheckEarlReportOptions } from './check/earl.js';
export type { PageCookie } from './browser/page-setup.js';
export {
   getAccessibilityTree,
   getPageHtml,
   getPageTitle,
   type AccessibilityTree,
} from './tree/runtime.js';
export {
   filterAriaTree,
   parseAriaSnapshot,
   serializeAriaTree,
   type AriaTreeNode,
} from './tree/parse.js';
export { runPatternCheck, type RunPatternCheckInput } from './apg/check-runtime.js';
export {
   attachRecordedJudgments,
   attributeRowOutcome,
   isSetAside,
   keyboardRowOutcome,
} from './apg/outcomes.js';
export {
   findApgExamples,
   listApgPatternSummaries,
   resolveApgLookup,
   showApgExample,
   showApgPattern,
   showApgPatternOrExample,
   searchAll,
   listApgRowKeys,
   listPendingApgRows,
   recordApgJudgment,
} from './apg/runtime.js';
export { runPageCheck, type PageCheck, type RunPageCheckInput } from './check/runtime.js';
export {
   withLoadedPage,
   withInteractiveBrowserPage,
   type WithBrowserPageOptions,
} from './browser/shared-browser.js';
export { buildNextCommands } from './check/next-commands.js';
export {
   getCriterionOutcome,
   type CheckCriterion,
   type CheckOutcome,
} from './check/criteria-rollup.js';
export type { CheckTreeSummary } from './check/tree-summary.js';
export { listCliCommands } from './command-catalog.js';
export {
   showWcagAxeRule,
   showWcagTestMethodSummary,
   showWcagTechnique,
   showWcagUnderstanding,
} from './wcag/runtime.js';
export {
   DEFAULT_IDLE_TIMEOUT_MINUTES,
   getActiveDriverSession,
   type DriverRequestOptions,
   type DriverSessionStart,
   type EphemeralDriverActionOptions,
   type StartDriverSessionOptions,
} from './driver/runtime.js';
export {
   DRIVER_MODE_ENV_VAR,
   resolveDriverMode,
   resolveStateRoot,
   STATE_DIR_ENV_VAR,
} from './driver/environment.js';
export {
   buildDriverTranscript,
   formatTranscript,
   resolveRecordingTranscriptPath,
   resolveTranscriptFormat,
   selectTranscriptEntries,
   writeDriverTranscript,
   type TranscriptSelection,
} from './driver/transcript.js';
export {
   getPortableCommand,
   portableCommandTable,
   type PortableCommandEntry,
} from '@a11ied/guidepup';
export {
   describeNavigation,
   getNavigationKindEntry,
   navigationKindTable,
   type NavigationKindEntry,
} from '@a11ied/guidepup';
export {
   describeMatcher,
   matchesText,
   parseTextMatcher,
   type TextMatcher,
} from './driver/matcher.js';
export {
   describeExpectationFailure,
   evaluateExpectation,
   type ExpectationOptions,
   type ExpectationResult,
} from './driver/expectation.js';
export {
   runDriverSessionBatch,
   type BatchRunOptions,
   type BatchRunResult,
   type BatchStepError,
   type BatchStepOutcome,
   type BatchStepResult,
} from './driver/batch.js';
export {
   isFrontmostMatch,
   waitForWindowFocus,
   WINDOW_FOCUS_TIMEOUT_MS,
   type FrontmostWindow,
   type WindowFocusResult,
} from '@a11ied/guidepup';
export {
   openUrlInBrowser,
   resolveBrowserChoice,
   type BrowserChoice,
} from './driver/browser-launch.js';
export {
   ScreenReader,
   type LoopOptions,
   type NavigateOptions,
   type WaitOptions,
} from './driver/screen-reader.js';
export {
   ScreenReaderAssertionError,
   type SpokenFailureDetails,
} from './driver/screen-reader-errors.js';
export {
   CommandQueue,
   type CommandQueueOptions,
   type Queued,
} from './driver/command-queue.js';
export {
   queueScreenReader,
   QUEUED_READER_METHOD_NAMES,
   type QueuedAssertion,
   type QueuedChain,
   type QueuedCommands,
   type QueuedExpectations,
   type QueuedScreenReader,
} from './driver/queued-screen-reader.js';
export {
   queuedScreenReader,
   screenReader,
   type ScreenReaderOptions,
} from './driver/screen-reader-node.js';
export {
   createContextTransport,
   type ContextTransportOptions,
} from './driver/screen-reader-context.js';
export type {
   ScreenReaderDocument,
   ScreenReaderRunOptions,
   ScreenReaderSession,
   ScreenReaderStep,
   ScreenReaderTransport,
} from './driver/screen-reader-transport.js';
export {
   checkCurrentItem,
   checkSpoken,
   checkSpokenInOrder,
   type SpokenCheck,
   type SpokenMatch,
   type RetryOptions,
   type SpokenOptions,
} from './driver/spoken-matchers.js';
export { matchesItem, type WantedItem } from './driver/broker-loops.js';
export {
   createVirtualHost,
   type VirtualHostChoice,
} from './driver/virtual-host-choice.js';
export { createPlaywrightVirtualHost } from './driver/virtual-playwright-host.js';
export {
   discoverSite,
   readInventory,
   writeInventoryAtomic,
   buildOriginKey,
   buildPageId,
   type DiscoverOptions,
} from './discovery/runtime.js';
export { discoverSitemapUrls, parseSitemap } from './discovery/sitemap.js';
export { crawlSameOrigin, normalizeUrl } from './discovery/crawl.js';
export {
   appendLine,
   withDirectoryCommit,
   withLockedFile,
   withPathLock,
   writeAtomic,
} from './files/store.js';
export { launchAutomationBrowser } from './browser/runtime.js';
export {
   scanAuditPages,
   type ScanOptions,
   type PageScanResult,
} from './audit/scan/scan.js';
export {
   discoverAuditPages,
   type DiscoveredPages,
   type DiscoverPagesOptions,
} from './audit/discover-pages.js';
export { captureSubmissionEvidence } from './audit/evidence.js';
export { screenshotElement } from './capture/element.js';
export {
   capturePage,
   captureWithBrowser,
   expandKeys,
   type CapturePageOptions,
   type CaptureResult,
   type FocusedElement,
} from './capture/runtime.js';
export {
   disableTalkBack,
   enableTalkBack,
   isTalkBackKey,
   parseTalkBackSpeech,
   TALKBACK_KEY_NAMES,
   TALKBACK_KEYS,
   walkWithTalkBack,
   type TalkBackKey,
   type TalkBackStep,
} from './android/talkback.js';
