import type { CliCommand } from '../../contracts/src/index.js';

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
   isDriverCommandSet,
   listDriverCommands,
   parseDriverCommandSet,
   resolveDriverCommand,
   type ConcreteDriverCommandSet,
   type DriverCommandList,
   type DriverCommandSet,
   type ListDriverCommandsOptions,
   type SerializableDriverCommand,
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

// Target resolution for page commands (axe, tree, audit).
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
   appendEvidence,
   clearEvidence,
   readEvidence,
   readEvidenceForSubject,
   type EvidenceStoreOptions,
} from './evidence/store.js';
export {
   listPendingCriteria,
   listRecordedCriterionIds,
   type ListPendingCriteriaInput,
} from './evidence/pending.js';
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
export { buildAuditEarlReport, type AuditEarlReportOptions } from './audit/earl.js';
export type { PageCookie } from './browser/page-setup.js';
export {
   getAccessibilityTree,
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
   findApgExamples,
   listApgPatternSummaries,
   resolveApgLookup,
   showApgExample,
   showApgPattern,
   showApgPatternOrExample,
   searchAll,
} from './apg/runtime.js';
export { buildAuditReport, type AuditReport } from './audit/runtime.js';
export { buildNextCommands } from './audit/next-commands.js';
export type { AuditCriterionRollup } from './audit/criteria-rollup.js';
export type { AuditTreeSummary } from './audit/tree-summary.js';

const cliCommands: CliCommand[] = [
   {
      name: 'wcag',
      summary: 'Query pinned WCAG criteria, test methods, and testing strategy data.',
      maturity: 'ready',
   },
   {
      name: 'pattern',
      summary:
         'Query the ARIA Authoring Practices Guide keyboard and attribute tables, and check a page against one.',
      maturity: 'ready',
   },
   {
      name: 'sr',
      summary:
         'Control VoiceOver, NVDA, or the virtual screen reader through stable screen-reader sessions.',
      maturity: 'ready',
   },
   {
      name: 'axe',
      summary: 'Run axe-core accessibility scans.',
      maturity: 'ready',
   },
   {
      name: 'tree',
      summary: 'Print the accessibility tree for a target.',
      maturity: 'ready',
   },
   {
      name: 'audit',
      summary:
         'Run axe, the accessibility tree, and the relevant criteria scan against a target.',
      maturity: 'ready',
   },
   {
      name: 'doctor',
      summary: 'Check the host for browser and screen reader readiness.',
      maturity: 'ready',
   },
   {
      name: 'setup',
      summary: 'Run the Guidepup setup steps this host still needs.',
      maturity: 'ready',
   },
   {
      name: 'mcp',
      summary: 'Expose the runtime over an MCP stdio server.',
      maturity: 'ready',
   },
];

/** Lists the shipped top-level CLI command families and their maturity labels. */
export function listCliCommands(): CliCommand[] {
   return cliCommands;
}

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
export { screenReader, type ScreenReaderOptions } from './driver/screen-reader-node.js';
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
   type SpokenOptions,
} from './driver/spoken-matchers.js';
export { matchesItem, type WantedItem } from './driver/broker-loops.js';
export {
   createVirtualHost,
   type VirtualHostChoice,
} from './driver/virtual-host-choice.js';
export { createPlaywrightVirtualHost } from './driver/virtual-playwright-host.js';
